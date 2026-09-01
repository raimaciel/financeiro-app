import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import { generateWorkspaceNotifications } from '../utils/notificationGenerator';
import { formatDateISO } from '../utils/invoiceCalculator';

const notificationsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

notificationsRouter.use('*', authMiddleware);

async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// GET /workspaces/:workspaceId/notifications - Obter notificações ativas em tempo real
notificationsRouter.get('/workspaces/:workspaceId/notifications', async (c) => {
	const workspaceId = c.req.param('workspaceId');
	const userId = String(c.get('userId'));
	try {
		const db = c.env.financeiro_db || (c.env as any).DB;

		if (!db) {
			console.error('[GET /notifications Error] Banco de dados não disponível');
			return c.json({ error: 'Erro de configuração do servidor' }, 500);
		}

		if (!workspaceId || workspaceId.trim() === '') {
			return c.json({ error: 'ID de workspace inválido' }, 400);
		}

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const now = new Date();
		const todayISO = formatDateISO(now);
		const currentMonth = todayISO.slice(0, 7); // YYYY-MM
		const monthStart = `${currentMonth}-01`;
		const monthEnd = `${currentMonth}-31`;

		// 1. Buscar orçamentos com categorias
		const { results: budgets } = await db
			.prepare(`
				SELECT b.id, b.workspace_id, b.category_id, b.monthly_limit, b.alert_threshold_percent, c.name as category_name
				FROM budgets b
				LEFT JOIN categories c ON c.id = b.category_id
				WHERE b.workspace_id = ?
			`)
			.bind(workspaceId)
			.all<any>();

		// 2. Buscar despesas do mês atual agrupadas por categoria
		const { results: categoryExpenses } = await db
			.prepare(`
				SELECT category_id, SUM(amount) as total_spent
				FROM transactions
				WHERE workspace_id = ? AND type = 'expense' AND date >= ? AND date <= ?
				GROUP BY category_id
			`)
			.bind(workspaceId, monthStart, monthEnd)
			.all<any>();

		const expensesByCategory: Record<number, number> = {};
		(categoryExpenses || []).forEach((row) => {
			if (row.category_id) {
				const val = Number(row.total_spent !== undefined ? row.total_spent : (row.amount || 0));
				expensesByCategory[row.category_id] = (expensesByCategory[row.category_id] || 0) + val;
			}
		});

		// 3. Buscar cartões de crédito e faturas registradas
		const { results: creditCards } = await db
			.prepare('SELECT id, name, brand, closing_day, due_day FROM credit_cards WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<any>();

		const { results: cardInvoices } = await db
			.prepare('SELECT credit_card_id, reference_month, status, paid_at FROM invoices WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<any>();

		// 4. Buscar metas de economia
		const { results: savingsGoals } = await db
			.prepare('SELECT id, name, target_amount, current_amount, target_date, status FROM savings_goals WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<any>();

		// 5. Buscar regras de recorrência ativas com as colunas corretas da tabela
		const { results: recurringRules } = await db
			.prepare('SELECT id, description, amount, type, frequency, day_of_month, day_of_week, start_date, end_date, last_generated_date, status FROM recurring_transactions WHERE workspace_id = ? AND status = "active"')
			.bind(workspaceId)
			.all<any>();

		// 6. Buscar data da última transação
		const lastTx = await db
			.prepare('SELECT date FROM transactions WHERE workspace_id = ? ORDER BY date DESC LIMIT 1')
			.bind(workspaceId)
			.first<any>();

		const notifications = generateWorkspaceNotifications({
			workspaceId,
			budgets: budgets || [],
			expensesByCategory,
			creditCards: creditCards || [],
			cardInvoices: cardInvoices || [],
			savingsGoals: savingsGoals || [],
			recurringRules: (recurringRules as any) || [],
			lastTransactionDate: lastTx?.date || null,
			currentDate: now,
		});

		return c.json({
			workspace_id: workspaceId,
			total_count: notifications.length,
			notifications,
		});
	} catch (err: any) {
		console.error('[GET /notifications Error]', {
			workspaceId,
			userId,
			errorMessage: err?.message || String(err),
			stack: err?.stack,
		});
		return c.json({ error: 'Erro ao gerar notificações' }, 500);
	}
});

export default notificationsRouter;
