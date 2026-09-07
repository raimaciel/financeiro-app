import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const budgetsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

budgetsRouter.use('*', authMiddleware);

async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// 1. GET /workspaces/:workspaceId/budgets - Listar orçamentos com gastos reais do mês
budgetsRouter.get('/workspaces/:workspaceId/budgets', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const month = c.req.query('month') || new Date().toISOString().slice(0, 7); // YYYY-MM

		// 1. Busca todos os orçamentos do mês ou recorrentes (sem mês definido)
		const budgetsQuery = `
			SELECT 
				b.*,
				cat.name AS category_name,
				cat.icon AS category_icon,
				cat.color AS category_color,
				cat.type AS category_type
			FROM budgets b
			JOIN categories cat ON b.category_id = cat.id
			WHERE b.workspace_id = ? AND (b.month = ? OR b.month_reference = ? OR (b.month IS NULL AND b.month_reference IS NULL))
			ORDER BY cat.name ASC
		`;

		const budgetsResult = await db.prepare(budgetsQuery).bind(workspaceId, month, month).all<any>();
		const budgetsList = budgetsResult.results || [];

		// 2. Busca total gasto real por categoria no mês informado
		const expensesQuery = `
			SELECT 
				category_id,
				SUM(amount) AS total_spent
			FROM transactions
			WHERE workspace_id = ? 
			  AND type = 'expense' 
			  AND date LIKE ? 
			  AND category_id IS NOT NULL
			GROUP BY category_id
		`;

		const expensesResult = await db
			.prepare(expensesQuery)
			.bind(workspaceId, `${month}%`)
			.all<{ category_id: number; total_spent: number }>();

		const spentMap: Record<number, number> = {};
		for (const row of expensesResult.results || []) {
			spentMap[row.category_id] = Number(row.total_spent || 0);
		}

		// 3. Monta lista detalhada com cálculos de percentual e status
		let totalBudgeted = 0;
		let totalSpent = 0;
		let warningCount = 0;
		let exceededCount = 0;
		let okCount = 0;

		const enrichedBudgets = budgetsList.map((b) => {
			const spent = spentMap[b.category_id] || 0;
			const limit = Number(b.limit_amount !== undefined && b.limit_amount !== null ? b.limit_amount : (b.monthly_limit || 0));
			const percentageUsed = limit > 0 ? Number(((spent / limit) * 100).toFixed(1)) : 0;
			const remaining = Number((limit - spent).toFixed(2));
			const threshold = Number(b.alert_threshold_percent) || 80;

			let status: 'ok' | 'warning' | 'exceeded' = 'ok';
			if (percentageUsed >= 100) {
				status = 'exceeded';
				exceededCount++;
			} else if (percentageUsed >= threshold) {
				status = 'warning';
				warningCount++;
			} else {
				okCount++;
			}

			totalBudgeted += limit;
			totalSpent += spent;

			const monthVal = b.month || b.month_reference || null;

			return {
				id: b.id,
				workspace_id: b.workspace_id,
				category_id: b.category_id,
				category_name: b.category_name,
				category_icon: b.category_icon,
				category_color: b.category_color,
				limit_amount: limit,
				monthly_limit: limit,
				month: monthVal,
				month_reference: monthVal,
				alert_threshold_percent: threshold,
				spent_amount: Number(spent.toFixed(2)),
				total_spent: Number(spent.toFixed(2)),
				remaining_amount: remaining,
				percentage_used: percentageUsed,
				percentage: percentageUsed,
				status,
			};
		});

		return c.json({
			workspace_id: workspaceId,
			month,
			summary: {
				total_budgeted: Number(totalBudgeted.toFixed(2)),
				total_spent: Number(totalSpent.toFixed(2)),
				total_remaining: Number((totalBudgeted - totalSpent).toFixed(2)),
				total_count: enrichedBudgets.length,
				ok_count: okCount,
				warning_count: warningCount,
				exceeded_count: exceededCount,
				in_alert_count: warningCount + exceededCount,
			},
			budgets: enrichedBudgets,
		});
	} catch (err: any) {
		console.error('Erro ao buscar orçamentos:', err);
		return c.json({ error: 'Erro ao buscar orçamentos' }, 500);
	}
});

// 2. POST /workspaces/:workspaceId/budgets - Criar ou atualizar orçamento de uma categoria (Upsert)
budgetsRouter.post('/workspaces/:workspaceId/budgets', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const body = await c.req.json();
		const {
			category_id,
			limit_amount,
			monthly_limit,
			month,
			month_reference,
			alert_threshold_percent = 80,
		} = body;

		if (!category_id) {
			return c.json({ error: 'A categoria é obrigatória' }, 400);
		}

		const rawLimit = limit_amount !== undefined ? limit_amount : monthly_limit;
		const limitNum = Number(rawLimit);
		if (isNaN(limitNum) || limitNum <= 0) {
			return c.json({ error: 'O limite mensal deve ser um número positivo' }, 400);
		}

		const categoryIdNum = Number(category_id);
		const rawMonth = month !== undefined ? month : month_reference;
		const monthVal = rawMonth && /^\d{4}-\d{2}$/.test(String(rawMonth).trim()) ? String(rawMonth).trim() : null;
		const thresholdNum = Number(alert_threshold_percent) || 80;

		// Busca se já existe orçamento para a categoria e mês (ou recorrente)
		let existing: { id: string } | null = null;
		if (monthVal) {
			existing = await db
				.prepare('SELECT id FROM budgets WHERE workspace_id = ? AND category_id = ? AND (month = ? OR month_reference = ?)')
				.bind(workspaceId, categoryIdNum, monthVal, monthVal)
				.first<{ id: string }>();
		} else {
			existing = await db
				.prepare('SELECT id FROM budgets WHERE workspace_id = ? AND category_id = ? AND (month IS NULL OR month_reference IS NULL)')
				.bind(workspaceId, categoryIdNum)
				.first<{ id: string }>();
		}

		if (existing) {
			await db
				.prepare(
					`UPDATE budgets 
					 SET limit_amount = ?, monthly_limit = ?, alert_threshold_percent = ?, month = ?, month_reference = ?, updated_at = CURRENT_TIMESTAMP 
					 WHERE id = ? AND workspace_id = ?`
				)
				.bind(limitNum, limitNum, thresholdNum, monthVal, monthVal, existing.id, workspaceId)
				.run();

			return c.json({
				message: 'Orçamento atualizado com sucesso!',
				id: existing.id,
				budget: {
					id: existing.id,
					workspace_id: workspaceId,
					category_id: categoryIdNum,
					limit_amount: limitNum,
					monthly_limit: limitNum,
					month: monthVal,
					month_reference: monthVal,
					alert_threshold_percent: thresholdNum,
				},
			}, 200);
		}

		const id = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO budgets (id, workspace_id, category_id, limit_amount, monthly_limit, month, month_reference, alert_threshold_percent)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(id, workspaceId, categoryIdNum, limitNum, limitNum, monthVal, monthVal, thresholdNum)
			.run();

		return c.json({
			message: 'Orçamento definido com sucesso!',
			id,
			budget: {
				id,
				workspace_id: workspaceId,
				category_id: categoryIdNum,
				limit_amount: limitNum,
				monthly_limit: limitNum,
				month: monthVal,
				month_reference: monthVal,
				alert_threshold_percent: thresholdNum,
			},
		}, 201);
	} catch (err: any) {
		console.error('Erro ao definir orçamento:', err);
		return c.json({ error: 'Erro ao salvar orçamento' }, 500);
	}
});

// 3. DELETE /workspaces/:workspaceId/budgets/:id - Remover orçamento
budgetsRouter.delete('/workspaces/:workspaceId/budgets/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const budgetId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const result = await db
			.prepare('DELETE FROM budgets WHERE id = ? AND workspace_id = ?')
			.bind(budgetId, workspaceId)
			.run();

		if (result.meta && result.meta.changes === 0) {
			return c.json({ error: 'Orçamento não encontrado' }, 404);
		}

		return c.json({ message: 'Orçamento removido com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao remover orçamento:', err);
		return c.json({ error: 'Erro ao remover orçamento' }, 500);
	}
});

export default budgetsRouter;
