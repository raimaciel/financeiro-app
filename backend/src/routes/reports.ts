import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const reportsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger rotas de relatórios com authMiddleware
reportsRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

/**
 * GET /workspaces/:workspaceId/reports/summary
 * Filtros suportados:
 * - start: YYYY-MM-DD (data inicial)
 * - end: YYYY-MM-DD (data final)
 * - account_id: string (id da conta bancária)
 * - category_id: number (id da categoria)
 * - type: 'income' | 'expense'
 */
reportsRouter.get('/workspaces/:workspaceId/reports/summary', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// 1. Validar membro do workspace (todos os membros, inclusive viewer, podem visualizar)
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		// 2. Parâmetros de consulta
		const start = c.req.query('start');
		const end = c.req.query('end');
		const accountId = c.req.query('account_id') || c.req.query('accountId');
		const categoryIdParam = c.req.query('category_id') || c.req.query('categoryId');
		const typeFilter = c.req.query('type');

		// 3. Validar account_id se fornecido
		if (accountId) {
			const account = await db
				.prepare('SELECT id FROM bank_accounts WHERE id = ? AND workspace_id = ?')
				.bind(accountId, workspaceId)
				.first<{ id: string }>();

			if (!account) {
				return c.json({ error: 'Conta bancária não encontrada ou não pertence a este workspace' }, 400);
			}
		}

		// 4. Validar category_id se fornecido
		let categoryId: number | null = null;
		if (categoryIdParam) {
			categoryId = Number(categoryIdParam);
			if (isNaN(categoryId)) {
				return c.json({ error: 'ID da categoria inválido' }, 400);
			}

			const category = await db
				.prepare('SELECT id FROM categories WHERE id = ? AND workspace_id = ?')
				.bind(categoryId, workspaceId)
				.first<{ id: number }>();

			if (!category) {
				return c.json({ error: 'Categoria não encontrada ou não pertence a este workspace' }, 400);
			}
		}

		// 5. Construir filtros base SQL para as transações
		const whereClauses: string[] = ['t.workspace_id = ?'];
		const baseParams: any[] = [workspaceId];

		if (start) {
			whereClauses.push('t.date >= ?');
			baseParams.push(start);
		}

		if (end) {
			whereClauses.push('t.date <= ?');
			baseParams.push(end);
		}

		if (accountId) {
			whereClauses.push('t.account_id = ?');
			baseParams.push(accountId);
		}

		if (categoryId !== null) {
			whereClauses.push('t.category_id = ?');
			baseParams.push(categoryId);
		}

		if (typeFilter && ['income', 'expense'].includes(typeFilter)) {
			whereClauses.push('t.type = ?');
			baseParams.push(typeFilter);
		}

		const whereSql = whereClauses.join(' AND ');

		// 6. Consultar Totais do Período
		const totalsSql = `
			SELECT 
				COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
				COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense,
				COUNT(t.id) as count
			FROM transactions t
			WHERE ${whereSql}
		`;

		const totalsResult = await db
			.prepare(totalsSql)
			.bind(...baseParams)
			.first<{ total_income: number; total_expense: number; count: number }>();

		const totalIncome = Number((totalsResult?.total_income || 0).toFixed(2));
		const totalExpense = Number((totalsResult?.total_expense || 0).toFixed(2));
		const balance = Number((totalIncome - totalExpense).toFixed(2));
		const totalCount = Number(totalsResult?.count || 0);

		// 7. Agrupamento por Categoria
		const categorySql = `
			SELECT 
				t.category_id,
				COALESCE(c.name, 'Sem Categoria') as name,
				COALESCE(c.color, '#64748b') as color,
				COALESCE(c.icon, 'Tag') as icon,
				t.type,
				ROUND(SUM(t.amount), 2) as total
			FROM transactions t
			LEFT JOIN categories c ON c.id = t.category_id
			WHERE ${whereSql}
			GROUP BY t.category_id, c.name, c.color, c.icon, t.type
			ORDER BY total DESC
		`;

		const { results: rawCategoryRows } = await db
			.prepare(categorySql)
			.bind(...baseParams)
			.all<any>();

		const baseSumForPercentage = totalExpense > 0 ? totalExpense : (totalIncome > 0 ? totalIncome : 1);

		const byCategory = (rawCategoryRows || []).map((row: any) => {
			const catTotal = Number(row.total || 0);
			// percentual baseado no total de despesas se for despesa, ou no total de receitas se for receita
			const denominator = row.type === 'income' ? (totalIncome > 0 ? totalIncome : catTotal) : (totalExpense > 0 ? totalExpense : catTotal);
			const percentage = denominator > 0 ? Number(((catTotal / denominator) * 100).toFixed(2)) : 0;

			return {
				category_id: row.category_id,
				name: row.name,
				color: row.color,
				icon: row.icon,
				type: row.type,
				total: catTotal,
				percentage,
			};
		});

		// 8. Agrupamento por Conta Bancária
		const accountSql = `
			SELECT 
				t.account_id,
				COALESCE(ba.name, 'Sem Conta') as name,
				COALESCE(ba.bank_name, 'Outro') as bank_name,
				COALESCE(ba.color, '#0284c7') as color,
				ROUND(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 2) as total_income,
				ROUND(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 2) as total_expense
			FROM transactions t
			LEFT JOIN bank_accounts ba ON ba.id = t.account_id
			WHERE ${whereSql}
			GROUP BY t.account_id, ba.name, ba.bank_name, ba.color
			ORDER BY (total_income + total_expense) DESC
		`;

		const { results: rawAccountRows } = await db
			.prepare(accountSql)
			.bind(...baseParams)
			.all<any>();

		const byAccount = (rawAccountRows || []).map((row: any) => {
			const inc = Number(row.total_income || 0);
			const exp = Number(row.total_expense || 0);
			return {
				account_id: row.account_id,
				name: row.name,
				bank_name: row.bank_name,
				color: row.color,
				total_income: inc,
				total_expense: exp,
				net_total: Number((inc - exp).toFixed(2)),
			};
		});

		// 9. Lista Detalhada de Transações
		const transactionsSql = `
			SELECT 
				t.id,
				t.workspace_id,
				t.user_id,
				t.category_id,
				t.account_id,
				t.credit_card_id,
				t.type,
				t.description,
				t.amount,
				t.date,
				t.installments,
				t.installment_current,
				c.name as category_name,
				c.color as category_color,
				c.icon as category_icon,
				ba.name as account_name,
				ba.bank_name as account_bank_name,
				ba.color as account_color,
				cc.name as credit_card_name
			FROM transactions t
			LEFT JOIN categories c ON c.id = t.category_id
			LEFT JOIN bank_accounts ba ON ba.id = t.account_id
			LEFT JOIN credit_cards cc ON cc.id = t.credit_card_id
			WHERE ${whereSql}
			ORDER BY t.date DESC, t.id DESC
			LIMIT 500
		`;

		const { results: rawTransactions } = await db
			.prepare(transactionsSql)
			.bind(...baseParams)
			.all<any>();

		return c.json({
			period: {
				start: start || null,
				end: end || null,
			},
			filters: {
				account_id: accountId || null,
				category_id: categoryId,
				type: typeFilter || null,
			},
			totals: {
				income: totalIncome,
				expense: totalExpense,
				balance,
				count: totalCount,
			},
			by_category: byCategory,
			by_account: byAccount,
			transactions: rawTransactions || [],
		});
	} catch (err) {
		console.error('Erro ao gerar relatório analítico:', err);
		return c.json({ error: 'Erro ao gerar relatório analítico' }, 500);
	}
});

export default reportsRouter;
