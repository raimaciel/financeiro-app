import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const budgetsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas com autenticação JWT
budgetsRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// -------------------------------------------------------------
// SEÇÃO A: ORÇAMENTOS POR CATEGORIA (BUDGETS)
// -------------------------------------------------------------

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

		// 1. Busca todos os orçamentos definidos para o workspace (específicos do mês ou padrão recorrente)
		const budgetsQuery = `
			SELECT 
				b.*,
				cat.name AS category_name,
				cat.icon AS category_icon,
				cat.color AS category_color,
				cat.type AS category_type
			FROM budgets b
			JOIN categories cat ON b.category_id = cat.id
			WHERE b.workspace_id = ? AND (b.month_reference = ? OR b.month_reference IS NULL)
			ORDER BY cat.name ASC
		`;

		const budgetsResult = await db.prepare(budgetsQuery).bind(workspaceId, month).all<any>();
		const budgetsList = budgetsResult.results || [];

		// 2. Busca total gasto por categoria no mês informado a partir da tabela transactions
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

		const expensesResult = await db.prepare(expensesQuery).bind(workspaceId, `${month}%`).all<{ category_id: number; total_spent: number }>();
		const spentMap: Record<number, number> = {};
		for (const row of expensesResult.results || []) {
			spentMap[row.category_id] = row.total_spent;
		}

		// 3. Monta lista detalhada com cálculos de percentual e status de alerta
		let totalBudgeted = 0;
		let totalSpent = 0;
		let warningCount = 0;
		let exceededCount = 0;
		let okCount = 0;

		const enrichedBudgets = budgetsList.map((b) => {
			const spent = spentMap[b.category_id] || 0;
			const limit = b.monthly_limit;
			const percentageUsed = limit > 0 ? Number(((spent / limit) * 100).toFixed(1)) : 0;
			const remaining = Number((limit - spent).toFixed(2));
			const threshold = b.alert_threshold_percent || 80;

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

			return {
				id: b.id,
				workspace_id: b.workspace_id,
				category_id: b.category_id,
				category_name: b.category_name,
				category_icon: b.category_icon,
				category_color: b.category_color,
				monthly_limit: limit,
				month_reference: b.month_reference,
				alert_threshold_percent: threshold,
				spent_amount: Number(spent.toFixed(2)),
				remaining_amount: remaining,
				percentage_used: percentageUsed,
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

// 2. POST /workspaces/:workspaceId/budgets - Criar ou atualizar orçamento de uma categoria
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
		const { category_id, monthly_limit, month_reference, alert_threshold_percent = 80 } = body;

		if (!category_id) {
			return c.json({ error: 'A categoria é obrigatória' }, 400);
		}

		const limitNum = Number(monthly_limit);
		if (isNaN(limitNum) || limitNum <= 0) {
			return c.json({ error: 'O limite mensal deve ser um número positivo' }, 400);
		}

		const categoryIdNum = Number(category_id);
		const monthRef = month_reference && /^\d{4}-\d{2}$/.test(String(month_reference).trim()) ? String(month_reference).trim() : null;
		const thresholdNum = Number(alert_threshold_percent) || 80;

		// Verifica se já existe orçamento para a categoria e mês
		const existingQuery = monthRef
			? 'SELECT id FROM budgets WHERE workspace_id = ? AND category_id = ? AND month_reference = ?'
			: 'SELECT id FROM budgets WHERE workspace_id = ? AND category_id = ? AND month_reference IS NULL';

		const existingParams = monthRef ? [workspaceId, categoryIdNum, monthRef] : [workspaceId, categoryIdNum];
		const existing = await db.prepare(existingQuery).bind(...existingParams).first<{ id: string }>();

		if (existing) {
			await db
				.prepare('UPDATE budgets SET monthly_limit = ?, alert_threshold_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
				.bind(limitNum, thresholdNum, existing.id)
				.run();

			return c.json({ message: 'Orçamento atualizado com sucesso!', id: existing.id });
		}

		const id = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO budgets (id, workspace_id, category_id, monthly_limit, month_reference, alert_threshold_percent)
				VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(id, workspaceId, categoryIdNum, limitNum, monthRef, thresholdNum)
			.run();

		return c.json({ message: 'Orçamento definido com sucesso!', id }, 201);
	} catch (err: any) {
		console.error('Erro ao definir orçamento:', err);
		return c.json({ error: 'Erro ao salvar orçamento' }, 500);
	}
});

// 3. PUT /workspaces/:workspaceId/budgets/:id - Editar orçamento
budgetsRouter.put('/workspaces/:workspaceId/budgets/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const budgetId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const body = await c.req.json();
		const { monthly_limit, alert_threshold_percent, month_reference } = body;

		const limitNum = Number(monthly_limit);
		if (isNaN(limitNum) || limitNum <= 0) {
			return c.json({ error: 'O limite mensal deve ser um número positivo' }, 400);
		}

		const thresholdNum = alert_threshold_percent ? Number(alert_threshold_percent) : 80;
		const monthRef = month_reference && /^\d{4}-\d{2}$/.test(String(month_reference).trim()) ? String(month_reference).trim() : null;

		const result = await db
			.prepare(
				`UPDATE budgets 
				SET monthly_limit = ?, alert_threshold_percent = ?, month_reference = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ? AND workspace_id = ?`
			)
			.bind(limitNum, thresholdNum, monthRef, budgetId, workspaceId)
			.run();

		if (result.meta.changes === 0) {
			return c.json({ error: 'Orçamento não encontrado' }, 404);
		}

		return c.json({ message: 'Orçamento atualizado com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao atualizar orçamento:', err);
		return c.json({ error: 'Erro ao atualizar orçamento' }, 500);
	}
});

// 4. DELETE /workspaces/:workspaceId/budgets/:id - Remover orçamento
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

		if (result.meta.changes === 0) {
			return c.json({ error: 'Orçamento não encontrado' }, 404);
		}

		return c.json({ message: 'Orçamento removido com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao remover orçamento:', err);
		return c.json({ error: 'Erro ao remover orçamento' }, 500);
	}
});

// -------------------------------------------------------------
// SEÇÃO B: METAS DE ECONOMIA (SAVINGS GOALS)
// -------------------------------------------------------------

// 5. GET /workspaces/:workspaceId/goals - Listar metas de economia com progresso
budgetsRouter.get('/workspaces/:workspaceId/goals', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const goalsResult = await db
			.prepare('SELECT * FROM savings_goals WHERE workspace_id = ? ORDER BY status ASC, created_at DESC')
			.bind(workspaceId)
			.all<any>();

		const goalsList = goalsResult.results || [];
		const today = new Date();

		let totalTargetAmount = 0;
		let totalCurrentAmount = 0;
		let activeGoals = 0;
		let completedGoals = 0;

		const enrichedGoals = goalsList.map((g) => {
			const target = g.target_amount;
			const current = g.current_amount;
			const percentage = target > 0 ? Number(Math.min(100, (current / target) * 100).toFixed(1)) : 0;
			const remaining = Number(Math.max(0, target - current).toFixed(2));

			let daysRemaining: number | null = null;
			if (g.target_date) {
				const targetDateObj = new Date(g.target_date);
				const diffTime = targetDateObj.getTime() - today.getTime();
				daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
			}

			if (g.status === 'active') {
				activeGoals++;
				totalTargetAmount += target;
				totalCurrentAmount += current;
			} else if (g.status === 'completed') {
				completedGoals++;
				totalTargetAmount += target;
				totalCurrentAmount += current;
			}

			return {
				...g,
				progress_percentage: percentage,
				remaining_amount: remaining,
				days_remaining: daysRemaining,
			};
		});

		const overallPercentage = totalTargetAmount > 0 ? Number(((totalCurrentAmount / totalTargetAmount) * 100).toFixed(1)) : 0;

		return c.json({
			workspace_id: workspaceId,
			summary: {
				total_goals: goalsList.length,
				active_goals: activeGoals,
				completed_goals: completedGoals,
				total_target_amount: Number(totalTargetAmount.toFixed(2)),
				total_saved_amount: Number(totalCurrentAmount.toFixed(2)),
				overall_percentage: overallPercentage,
			},
			goals: enrichedGoals,
		});
	} catch (err: any) {
		console.error('Erro ao listar metas de economia:', err);
		return c.json({ error: 'Erro ao buscar metas de economia' }, 500);
	}
});

// 6. POST /workspaces/:workspaceId/goals - Criar meta de economia
budgetsRouter.post('/workspaces/:workspaceId/goals', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const body = await c.req.json();
		const { name, target_amount, current_amount = 0, target_date } = body;

		if (!name || typeof name !== 'string' || !name.trim()) {
			return c.json({ error: 'O nome da meta é obrigatório' }, 400);
		}

		const targetNum = Number(target_amount);
		if (isNaN(targetNum) || targetNum <= 0) {
			return c.json({ error: 'O valor alvo deve ser um número positivo' }, 400);
		}

		const currentNum = Number(current_amount) || 0;
		const cleanTargetDate = target_date && /^\d{4}-\d{2}-\d{2}$/.test(String(target_date).trim()) ? String(target_date).trim() : null;
		const status = currentNum >= targetNum ? 'completed' : 'active';
		const id = crypto.randomUUID();

		await db
			.prepare(
				`INSERT INTO savings_goals (id, workspace_id, user_id, name, target_amount, current_amount, target_date, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(id, workspaceId, userId, name.trim(), targetNum, currentNum, cleanTargetDate, status)
			.run();

		return c.json(
			{
				message: 'Meta de economia criada com sucesso!',
				goal: {
					id,
					workspace_id: workspaceId,
					name: name.trim(),
					target_amount: targetNum,
					current_amount: currentNum,
					target_date: cleanTargetDate,
					status,
				},
			},
			201
		);
	} catch (err: any) {
		console.error('Erro ao criar meta de economia:', err);
		return c.json({ error: 'Erro ao criar meta de economia' }, 500);
	}
});

// 7. PUT /workspaces/:workspaceId/goals/:id - Editar meta de economia
budgetsRouter.put('/workspaces/:workspaceId/goals/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const goalId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const body = await c.req.json();
		const { name, target_amount, current_amount, target_date, status } = body;

		const targetNum = Number(target_amount);
		if (isNaN(targetNum) || targetNum <= 0) {
			return c.json({ error: 'O valor alvo deve ser um número positivo' }, 400);
		}

		const currentNum = Number(current_amount) || 0;
		const cleanTargetDate = target_date && /^\d{4}-\d{2}-\d{2}$/.test(String(target_date).trim()) ? String(target_date).trim() : null;

		let newStatus = status;
		if (!newStatus) {
			newStatus = currentNum >= targetNum ? 'completed' : 'active';
		}

		const result = await db
			.prepare(
				`UPDATE savings_goals 
				SET name = ?, target_amount = ?, current_amount = ?, target_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ? AND workspace_id = ?`
			)
			.bind(name.trim(), targetNum, currentNum, cleanTargetDate, newStatus, goalId, workspaceId)
			.run();

		if (result.meta.changes === 0) {
			return c.json({ error: 'Meta não encontrada' }, 404);
		}

		return c.json({ message: 'Meta de economia atualizada com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao atualizar meta:', err);
		return c.json({ error: 'Erro ao atualizar meta de economia' }, 500);
	}
});

// 8. PATCH /workspaces/:workspaceId/goals/:id/deposit - Depositar/alocar valor na meta
budgetsRouter.patch('/workspaces/:workspaceId/goals/:id/deposit', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const goalId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const existing = await db
			.prepare('SELECT id, target_amount, current_amount FROM savings_goals WHERE id = ? AND workspace_id = ?')
			.bind(goalId, workspaceId)
			.first<{ id: string; target_amount: number; current_amount: number }>();

		if (!existing) {
			return c.json({ error: 'Meta não encontrada' }, 404);
		}

		const body = await c.req.json();
		const depositAmount = Number(body.amount);
		if (isNaN(depositAmount) || depositAmount <= 0) {
			return c.json({ error: 'Informe um valor de depósito positivo' }, 400);
		}

		const newCurrent = Number((existing.current_amount + depositAmount).toFixed(2));
		const newStatus = newCurrent >= existing.target_amount ? 'completed' : 'active';

		await db
			.prepare('UPDATE savings_goals SET current_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?')
			.bind(newCurrent, newStatus, goalId, workspaceId)
			.run();

		return c.json({
			message: newStatus === 'completed' ? 'Parabéns! Meta de economia atingida com sucesso!' : 'Depósito registrado na meta!',
			current_amount: newCurrent,
			status: newStatus,
		});
	} catch (err: any) {
		console.error('Erro ao registrar depósito na meta:', err);
		return c.json({ error: 'Erro ao registrar depósito' }, 500);
	}
});

// 9. DELETE /workspaces/:workspaceId/goals/:id - Excluir meta de economia
budgetsRouter.delete('/workspaces/:workspaceId/goals/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const goalId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const result = await db
			.prepare('DELETE FROM savings_goals WHERE id = ? AND workspace_id = ?')
			.bind(goalId, workspaceId)
			.run();

		if (result.meta.changes === 0) {
			return c.json({ error: 'Meta não encontrada' }, 404);
		}

		return c.json({ message: 'Meta removida com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao remover meta:', err);
		return c.json({ error: 'Erro ao remover meta' }, 500);
	}
});

export default budgetsRouter;
