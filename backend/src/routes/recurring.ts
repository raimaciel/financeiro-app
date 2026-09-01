import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import { detectRecurringPatterns, type TransactionForDetection } from '../utils/recurringDetector';
import { generateTransactionsForRule, type RecurringRule } from '../utils/recurringGenerator';

const recurringRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas com autenticação JWT
recurringRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// 1. GET /workspaces/:workspaceId/recurring - Listar regras de recorrência e estatísticas
recurringRouter.get('/workspaces/:workspaceId/recurring', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const query = `
			SELECT 
				r.*,
				cat.name AS category_name,
				cat.icon AS category_icon,
				cat.color AS category_color,
				card.name AS credit_card_name,
				card.color AS credit_card_color
			FROM recurring_transactions r
			LEFT JOIN categories cat ON r.category_id = cat.id
			LEFT JOIN credit_cards card ON r.credit_card_id = card.id
			WHERE r.workspace_id = ?
			ORDER BY r.status ASC, r.day_of_month ASC, r.description ASC
		`;

		const result = await db.prepare(query).bind(workspaceId).all<any>();
		const recurrings = result.results || [];

		// Calcula estatísticas
		let activeCount = 0;
		let pausedCount = 0;
		let monthlyExpensesTotal = 0;
		let monthlyIncomeTotal = 0;

		for (const r of recurrings) {
			if (r.status === 'active') {
				activeCount++;
				if (r.type === 'expense') {
					monthlyExpensesTotal += r.amount;
				} else {
					monthlyIncomeTotal += r.amount;
				}
			} else if (r.status === 'paused') {
				pausedCount++;
			}
		}

		return c.json({
			workspace_id: workspaceId,
			summary: {
				active_count: activeCount,
				paused_count: pausedCount,
				total_count: recurrings.length,
				monthly_expenses_total: Number(monthlyExpensesTotal.toFixed(2)),
				monthly_income_total: Number(monthlyIncomeTotal.toFixed(2)),
				monthly_balance: Number((monthlyIncomeTotal - monthlyExpensesTotal).toFixed(2)),
			},
			recurrings,
		});
	} catch (err: any) {
		console.error('Erro ao listar recorrências:', err);
		return c.json({ error: 'Erro ao buscar transações recorrentes' }, 500);
	}
});

// 2. GET /workspaces/:workspaceId/recurring/suggestions - Detectar e sugerir recorrências a partir do histórico
recurringRouter.get('/workspaces/:workspaceId/recurring/suggestions', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		// 1. Busca transações dos últimos 180 dias para análise de padrão
		const transactionsResult = await db
			.prepare('SELECT id, description, amount, type, date, category_id, credit_card_id FROM transactions WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<TransactionForDetection>();

		const transactions = transactionsResult.results || [];

		// 2. Busca recorrências já cadastradas para não sugerir o que já existe
		const existingRecurringResult = await db
			.prepare('SELECT description, type, day_of_month FROM recurring_transactions WHERE workspace_id = ? AND status != "cancelled"')
			.bind(workspaceId)
			.all<{ description: string; type: string; day_of_month: number }>();

		const existingRecurrings = existingRecurringResult.results || [];

		// 3. Executa algoritmo de detecção
		const allSuggestions = detectRecurringPatterns(transactions);

		// 4. Filtra sugestões que já possuem regra ativa ou pausada
		const filteredSuggestions = allSuggestions.filter((sug) => {
			const normSug = sug.description.toLowerCase().trim();
			const alreadyExists = existingRecurrings.some((ex) => {
				const normEx = ex.description.toLowerCase().trim();
				return (normEx.includes(normSug) || normSug.includes(normEx)) && ex.type === sug.type;
			});
			return !alreadyExists;
		});

		return c.json({
			workspace_id: workspaceId,
			total_suggestions: filteredSuggestions.length,
			suggestions: filteredSuggestions,
		});
	} catch (err: any) {
		console.error('Erro ao detectar sugestões de recorrência:', err);
		return c.json({ error: 'Erro ao analisar padrões de recorrência' }, 500);
	}
});

// 3. POST /workspaces/:workspaceId/recurring - Criar nova regra de recorrência
recurringRouter.post('/workspaces/:workspaceId/recurring', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Usuários viewer não podem criar recorrências' }, 403);
		}

		const body = await c.req.json();
		const {
			description,
			amount,
			type,
			category_id,
			credit_card_id,
			frequency = 'monthly',
			day_of_month,
			day_of_week,
			start_date,
			end_date,
		} = body;

		if (!description || typeof description !== 'string' || !description.trim()) {
			return c.json({ error: 'A descrição da recorrência é obrigatória' }, 400);
		}

		const amountNum = Number(amount);
		if (isNaN(amountNum) || amountNum <= 0) {
			return c.json({ error: 'O valor deve ser um número positivo' }, 400);
		}

		if (!type || !['income', 'expense'].includes(type)) {
			return c.json({ error: 'O tipo deve ser "income" ou "expense"' }, 400);
		}

		if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(start_date).trim())) {
			return c.json({ error: 'A data inicial é obrigatória (formato YYYY-MM-DD)' }, 400);
		}

		const cleanStartDate = String(start_date).trim();
		const cleanEndDate = end_date && /^\d{4}-\d{2}-\d{2}$/.test(String(end_date).trim()) ? String(end_date).trim() : null;

		let dayOfMonthNum = day_of_month ? parseInt(String(day_of_month), 10) : parseInt(cleanStartDate.split('-')[2], 10);
		if (isNaN(dayOfMonthNum) || dayOfMonthNum < 1 || dayOfMonthNum > 31) {
			dayOfMonthNum = 1;
		}

		const id = crypto.randomUUID();
		const categoryIdNum = category_id !== undefined && category_id !== null && category_id !== 'none' ? Number(category_id) : null;
		const creditCardIdStr = credit_card_id && credit_card_id !== 'none' && typeof credit_card_id === 'string' ? credit_card_id.trim() : null;

		await db
			.prepare(
				`INSERT INTO recurring_transactions 
				(id, workspace_id, user_id, description, amount, type, category_id, credit_card_id, frequency, day_of_month, day_of_week, start_date, end_date, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
			)
			.bind(
				id,
				workspaceId,
				userId,
				description.trim(),
				amountNum,
				type,
				categoryIdNum,
				creditCardIdStr,
				frequency,
				dayOfMonthNum,
				day_of_week ? Number(day_of_week) : null,
				cleanStartDate,
				cleanEndDate
			)
			.run();

		return c.json(
			{
				message: 'Regra de recorrência criada com sucesso!',
				recurring: {
					id,
					workspace_id: workspaceId,
					description: description.trim(),
					amount: amountNum,
					type,
					category_id: categoryIdNum,
					credit_card_id: creditCardIdStr,
					frequency,
					day_of_month: dayOfMonthNum,
					start_date: cleanStartDate,
					end_date: cleanEndDate,
					status: 'active',
				},
			},
			201
		);
	} catch (err: any) {
		console.error('Erro ao criar recorrência:', err);
		return c.json({ error: 'Erro ao criar transação recorrente' }, 500);
	}
});

// 4. PUT /workspaces/:workspaceId/recurring/:id - Atualizar regra de recorrência
recurringRouter.put('/workspaces/:workspaceId/recurring/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const recurringId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Usuários viewer não podem editar recorrências' }, 403);
		}

		const existing = await db
			.prepare('SELECT id FROM recurring_transactions WHERE id = ? AND workspace_id = ?')
			.bind(recurringId, workspaceId)
			.first();

		if (!existing) {
			return c.json({ error: 'Recorrência não encontrada' }, 404);
		}

		const body = await c.req.json();
		const { description, amount, type, category_id, credit_card_id, frequency, day_of_month, start_date, end_date, status } = body;

		const amountNum = Number(amount);
		if (isNaN(amountNum) || amountNum <= 0) {
			return c.json({ error: 'O valor deve ser um número positivo' }, 400);
		}

		const categoryIdNum = category_id !== undefined && category_id !== null && category_id !== 'none' ? Number(category_id) : null;
		const creditCardIdStr = credit_card_id && credit_card_id !== 'none' && typeof credit_card_id === 'string' ? credit_card_id.trim() : null;

		await db
			.prepare(
				`UPDATE recurring_transactions 
				SET description = ?, amount = ?, type = ?, category_id = ?, credit_card_id = ?, frequency = COALESCE(?, frequency), day_of_month = COALESCE(?, day_of_month), start_date = COALESCE(?, start_date), end_date = ?, status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP
				WHERE id = ? AND workspace_id = ?`
			)
			.bind(
				description.trim(),
				amountNum,
				type,
				categoryIdNum,
				creditCardIdStr,
				frequency || null,
				day_of_month ? Number(day_of_month) : null,
				start_date ? String(start_date).trim() : null,
				end_date ? String(end_date).trim() : null,
				status || null,
				recurringId,
				workspaceId
			)
			.run();

		return c.json({ message: 'Recorrência atualizada com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao atualizar recorrência:', err);
		return c.json({ error: 'Erro ao atualizar transação recorrente' }, 500);
	}
});

// 5. PATCH /workspaces/:workspaceId/recurring/:id/pause - Pausar ou reativar recorrência
recurringRouter.patch('/workspaces/:workspaceId/recurring/:id/pause', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const recurringId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const existing = await db
			.prepare('SELECT id, status FROM recurring_transactions WHERE id = ? AND workspace_id = ?')
			.bind(recurringId, workspaceId)
			.first<{ id: string; status: string }>();

		if (!existing) {
			return c.json({ error: 'Recorrência não encontrada' }, 404);
		}

		const newStatus = existing.status === 'active' ? 'paused' : 'active';

		await db
			.prepare('UPDATE recurring_transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?')
			.bind(newStatus, recurringId, workspaceId)
			.run();

		return c.json({
			message: newStatus === 'active' ? 'Recorrência reativada!' : 'Recorrência pausada!',
			status: newStatus,
		});
	} catch (err: any) {
		console.error('Erro ao alterar status da recorrência:', err);
		return c.json({ error: 'Erro ao alterar status' }, 500);
	}
});

// 6. DELETE /workspaces/:workspaceId/recurring/:id - Excluir regra de recorrência
recurringRouter.delete('/workspaces/:workspaceId/recurring/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const recurringId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const result = await db
			.prepare('DELETE FROM recurring_transactions WHERE id = ? AND workspace_id = ?')
			.bind(recurringId, workspaceId)
			.run();

		if (result.meta.changes === 0) {
			return c.json({ error: 'Recorrência não encontrada' }, 404);
		}

		return c.json({ message: 'Recorrência removida com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao excluir recorrência:', err);
		return c.json({ error: 'Erro ao remover recorrência' }, 500);
	}
});

// 7. POST /workspaces/:workspaceId/recurring/generate - Gerar transações pendentes a partir das recorrências ativas
recurringRouter.post('/workspaces/:workspaceId/recurring/generate', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const body = await c.req.json().catch(() => ({}));
		const targetDate = (body as any)?.targetDate || new Date().toISOString().slice(0, 10);
		const recurringId = (body as any)?.recurringId || null;

		let query = 'SELECT * FROM recurring_transactions WHERE workspace_id = ? AND status = "active"';
		const params: any[] = [workspaceId];

		if (recurringId) {
			query += ' AND id = ?';
			params.push(recurringId);
		}

		const rulesResult = await db.prepare(query).bind(...params).all<RecurringRule>();
		const rules = rulesResult.results || [];

		if (rules.length === 0) {
			return c.json({
				success: true,
				generated_count: 0,
				message: 'Nenhuma regra de recorrência ativa encontrada.',
			});
		}

		let totalGenerated = 0;
		const statements: D1PreparedStatement[] = [];

		for (const rule of rules) {
			const { transactions: pendingTx, newLastGeneratedDate } = generateTransactionsForRule(rule, targetDate);

			if (pendingTx.length > 0) {
				for (const tx of pendingTx) {
					const stmt = db
						.prepare(
							`INSERT INTO transactions 
							(workspace_id, user_id, category_id, credit_card_id, type, description, amount, installments, installment_current, date)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
						)
						.bind(
							tx.workspace_id,
							userId,
							tx.category_id,
							tx.credit_card_id,
							tx.type,
							tx.description,
							tx.amount,
							1,
							1,
							tx.date
						);
					statements.push(stmt);
				}

				// Atualiza o last_generated_date da regra
				if (newLastGeneratedDate) {
					const updateStmt = db
						.prepare('UPDATE recurring_transactions SET last_generated_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
						.bind(newLastGeneratedDate, rule.id);
					statements.push(updateStmt);
				}

				totalGenerated += pendingTx.length;
			}
		}

		// Executa lote no D1
		const CHUNK_SIZE = 100;
		for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
			const chunk = statements.slice(i, i + CHUNK_SIZE);
			await db.batch(chunk);
		}

		return c.json({
			success: true,
			generated_count: totalGenerated,
			message:
				totalGenerated > 0
					? `${totalGenerated} transação(ões) futura(s) gerada(s) com sucesso!`
					: 'Todas as transações recorrentes já estão em dia!',
		});
	} catch (err: any) {
		console.error('Erro ao gerar transações recorrentes:', err);
		return c.json({ error: 'Erro ao gerar transações futuras' }, 500);
	}
});

export default recurringRouter;
