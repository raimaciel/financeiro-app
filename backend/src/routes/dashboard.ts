/**
 * =================================================================================================
 * DASHBOARD FINANCEIRO - MÉTRICAS, GRÁFICOS E FATURAS CONSOLIDADAS
 * 
 * Regra Unificada de Faturas:
 * As faturas exibidas no Dashboard utilizam exatamente a mesma competência contábil (date LIKE 'YYYY-MM-%')
 * e os mesmos vínculos (transactions.credit_card_id = credit_cards.id) que a tela de Cartões e o Modal de Faturas.
 * =================================================================================================
 */

import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const dashboardRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas do dashboard com authMiddleware
dashboardRouter.use('*', authMiddleware);

// Helpers
function getSafeDate(year: number, month: number, day: number): Date {
	const maxDay = new Date(year, month + 1, 0).getDate();
	const safeDay = Math.min(day, maxDay);
	return new Date(year, month, safeDay);
}

function formatDate(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

function shiftMonth(yearMonth: string, delta: number): string {
	const [yyyy, mm] = yearMonth.split('-').map(Number);
	const d = new Date(yyyy, mm - 1 + delta, 1);
	const nextY = d.getFullYear();
	const nextM = String(d.getMonth() + 1).padStart(2, '0');
	return `${nextY}-${nextM}`;
}

function formatMonthShortLabel(yearMonth: string): string {
	const [yyyy, mm] = yearMonth.split('-').map(Number);
	const d = new Date(yyyy, mm - 1, 1);
	const monthShort = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
	const monthCapitalized = monthShort.charAt(0).toUpperCase() + monthShort.slice(1);
	const yearShort = String(yyyy).slice(2);
	return `${monthCapitalized}/${yearShort}`;
}

async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// GET /workspaces/:workspaceId/dashboard - Métricas consolidadas, gráficos e resumos
dashboardRouter.get('/workspaces/:workspaceId/dashboard', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const now = new Date();
		const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		const selectedMonth = c.req.query('month') || currentYearMonth;
		const prevMonth = shiftMonth(selectedMonth, -1);

		// 1. Receitas, Despesas e Saldo do Mês Atual
		const currentMonthIncomeResult = await db
			.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE workspace_id = ? AND type = 'income' AND date LIKE ?")
			.bind(workspaceId, `${selectedMonth}-%`)
			.first<{ total: number }>();

		const currentMonthExpenseResult = await db
			.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE workspace_id = ? AND type = 'expense' AND date LIKE ?")
			.bind(workspaceId, `${selectedMonth}-%`)
			.first<{ total: number }>();

		const totalIncome = Number((currentMonthIncomeResult?.total || 0).toFixed(2));
		const totalExpense = Number((currentMonthExpenseResult?.total || 0).toFixed(2));
		const balance = Number((totalIncome - totalExpense).toFixed(2));

		// 2. Mês Anterior (para cálculo de variação percentual)
		const prevMonthIncomeResult = await db
			.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE workspace_id = ? AND type = 'income' AND date LIKE ?")
			.bind(workspaceId, `${prevMonth}-%`)
			.first<{ total: number }>();

		const prevMonthExpenseResult = await db
			.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE workspace_id = ? AND type = 'expense' AND date LIKE ?")
			.bind(workspaceId, `${prevMonth}-%`)
			.first<{ total: number }>();

		const prevIncome = prevMonthIncomeResult?.total || 0;
		const prevExpense = prevMonthExpenseResult?.total || 0;

		const incomeChangePercent = prevIncome > 0
			? Number((((totalIncome - prevIncome) / prevIncome) * 100).toFixed(1))
			: totalIncome > 0 ? 100 : 0;

		const expenseChangePercent = prevExpense > 0
			? Number((((totalExpense - prevExpense) / prevExpense) * 100).toFixed(1))
			: totalExpense > 0 ? 100 : 0;

		// 3. Evolução dos últimos 6 meses
		const last6Months: Array<{ month: string; label: string; income: number; expense: number; balance: number }> = [];
		for (let i = 5; i >= 0; i--) {
			const m = shiftMonth(selectedMonth, -i);
			const label = formatMonthShortLabel(m);

			const incRes = await db
				.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE workspace_id = ? AND type = 'income' AND date LIKE ?")
				.bind(workspaceId, `${m}-%`)
				.first<{ total: number }>();

			const expRes = await db
				.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE workspace_id = ? AND type = 'expense' AND date LIKE ?")
				.bind(workspaceId, `${m}-%`)
				.first<{ total: number }>();

			const inc = Number((incRes?.total || 0).toFixed(2));
			const exp = Number((expRes?.total || 0).toFixed(2));

			last6Months.push({
				month: m,
				label,
				income: inc,
				expense: exp,
				balance: Number((inc - exp).toFixed(2)),
			});
		}

		// 4. Distribuição de Gastos por Categoria no Mês Atual
		const { results: categoryExpenses } = await db
			.prepare(`
				SELECT 
					t.category_id as category_id,
					COALESCE(c.name, 'Outros') as name,
					COALESCE(c.color, '#64748B') as color,
					COALESCE(c.icon, 'Tag') as icon,
					ROUND(SUM(t.amount), 2) as total
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.workspace_id = ? AND t.type = 'expense' AND t.date LIKE ?
				GROUP BY t.category_id, c.name, c.color, c.icon
				ORDER BY total DESC
			`)
			.bind(workspaceId, `${selectedMonth}-%`)
			.all<any>();

		const categoriesWithPercentage = (categoryExpenses || []).map((cat) => ({
			...cat,
			percentage: totalExpense > 0 ? Number(((cat.total / totalExpense) * 100).toFixed(1)) : 0,
		}));

		// 5. Top 5 Maiores Gastos do Mês
		const { results: topExpenses } = await db
			.prepare(`
				SELECT 
					t.id,
					t.description,
					t.amount,
					t.date,
					t.installments,
					t.installment_current as installmentCurrent,
					c.name as category_name,
					c.color as category_color,
					c.icon as category_icon,
					cc.name as credit_card_name
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				LEFT JOIN credit_cards cc ON cc.id = t.credit_card_id
				WHERE t.workspace_id = ? AND t.type = 'expense' AND t.date LIKE ?
				ORDER BY t.amount DESC, t.date DESC
				LIMIT 5
			`)
			.bind(workspaceId, `${selectedMonth}-%`)
			.all<any>();

		// 6. Faturas de Cartão a Vencer e Limite Disponível
		const { results: cards } = await db
			.prepare('SELECT id, name, brand, color, limit_amount, closing_day, due_day FROM credit_cards WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<any>();

		let totalCardsLimit = 0;
		let totalUsedLimit = 0;
		const upcomingInvoices: any[] = [];
		let totalInvoicesDue = 0;

		const today = new Date();
		const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

		for (const card of cards || []) {
			const limitAmount = Number(card.limit_amount || 0);
			totalCardsLimit += limitAmount;

			const closingDay = Number(card.closing_day);
			const dueDay = Number(card.due_day);

			// Calcular fatura atual e próxima
			const [yStr, mStr] = selectedMonth.split('-').map(Number);
			
			// Reference month da fatura
			const closingDate = getSafeDate(yStr, mStr - 1, closingDay);
			const prevClosingDate = getSafeDate(yStr, mStr - 2, closingDay);
			const dueDate = getSafeDate(closingDate.getFullYear(), closingDate.getMonth() + 1, dueDay);

			const prevClosingPlus1 = new Date(prevClosingDate);
			prevClosingPlus1.setDate(prevClosingPlus1.getDate() + 1);

			const startDateStr = formatDate(prevClosingPlus1);
			const closingDateStr = formatDate(closingDate);
			const dueDateStr = formatDate(dueDate);

			// Buscar transações dessa fatura
			const sumRes = await db
				.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE credit_card_id = ? AND workspace_id = ? AND type = 'expense' AND date LIKE ?")
				.bind(card.id, workspaceId, `${selectedMonth}-%`)
				.first<{ total: number }>();

			const invoiceTotal = Number((sumRes?.total || 0).toFixed(2));
			totalUsedLimit += invoiceTotal;

			// Verificar se está paga no banco
			const dbInv = await db
				.prepare('SELECT id, status, paid_at FROM invoices WHERE credit_card_id = ? AND reference_month = ?')
				.bind(card.id, selectedMonth)
				.first<any>();

			const isPaid = dbInv?.status === 'paid';
			const diffTime = dueDate.getTime() - todayMidnight.getTime();
			const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
			const isClosed = todayMidnight > closingDate;

			const status = isPaid ? 'paid' : isClosed ? 'closed' : 'open';

			if (!isPaid && invoiceTotal > 0) {
				totalInvoicesDue += invoiceTotal;
				upcomingInvoices.push({
					id: dbInv?.id || `inv_${card.id}_${selectedMonth}`,
					card_id: card.id,
					card_name: card.name,
					card_brand: card.brand,
					card_color: card.color,
					reference_month: selectedMonth,
					total_amount: invoiceTotal,
					due_date: dueDateStr,
					days_until_due: daysUntilDue,
					status,
				});
			}
		}

		const availableLimit = Math.max(0, totalCardsLimit - totalUsedLimit);
		const limitUsagePercentage = totalCardsLimit > 0
			? Number(((totalUsedLimit / totalCardsLimit) * 100).toFixed(1))
			: 0;

		// 8. Saldo por Conta Bancária (contas ativas)
		const accountsResult = await db
			.prepare(`
				SELECT 
					ba.id, 
					ba.name, 
					ba.bank_name, 
					ba.color, 
					ba.account_type, 
					ba.initial_balance,
					COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
					COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense,
					COALESCE((SELECT SUM(amount) FROM account_transfers WHERE from_account_id = ba.id AND workspace_id = ba.workspace_id), 0) as total_transfers_out,
					COALESCE((SELECT SUM(amount) FROM account_transfers WHERE to_account_id = ba.id AND workspace_id = ba.workspace_id), 0) as total_transfers_in
				FROM bank_accounts ba
				LEFT JOIN transactions t ON t.account_id = ba.id AND t.workspace_id = ba.workspace_id
				WHERE ba.workspace_id = ? AND ba.status = 'active'
				GROUP BY ba.id, ba.name, ba.bank_name, ba.color, ba.account_type, ba.initial_balance
				ORDER BY ba.name ASC
			`)
			.bind(workspaceId)
			.all<{
				id: string;
				name: string;
				bank_name: string | null;
				color: string | null;
				account_type: string;
				initial_balance: number;
				total_income: number;
				total_expense: number;
				total_transfers_out: number;
				total_transfers_in: number;
			}>();

		const accountsRows = accountsResult.results || [];
		const accountsBalance = accountsRows.map((acc) => {
			const initialBal = acc.initial_balance || 0;
			const income = acc.total_income || 0;
			const expense = acc.total_expense || 0;
			const transfersOut = acc.total_transfers_out || 0;
			const transfersIn = acc.total_transfers_in || 0;
			const currentBal = Number((initialBal + income - expense - transfersOut + transfersIn).toFixed(2));
			return {
				id: acc.id,
				name: acc.name,
				bank_name: acc.bank_name || null,
				color: acc.color || '#2563eb',
				account_type: acc.account_type,
				initial_balance: Number(initialBal.toFixed(2)),
				current_balance: currentBal,
			};
		});

		const totalAccountsBalance = Number(
			accountsBalance.reduce((sum, acc) => sum + acc.current_balance, 0).toFixed(2)
		);

		return c.json({
			month: selectedMonth,
			summary: {
				total_income: totalIncome,
				total_expense: totalExpense,
				balance,
				income_change_percent: incomeChangePercent,
				expense_change_percent: expenseChangePercent,
			},
			evolution_last_6_months: last6Months,
			expenses_by_category: categoriesWithPercentage,
			top_expenses: topExpenses || [],
			cards_summary: {
				total_limit: Number(totalCardsLimit.toFixed(2)),
				used_limit: Number(totalUsedLimit.toFixed(2)),
				available_limit: Number(availableLimit.toFixed(2)),
				usage_percentage: limitUsagePercentage,
				cards_count: (cards || []).length,
			},
			invoices_summary: {
				total_invoices_due: Number(totalInvoicesDue.toFixed(2)),
				invoices_due_count: upcomingInvoices.length,
				upcoming_invoices: upcomingInvoices,
			},
			accounts_balance: accountsBalance,
			total_accounts_balance: totalAccountsBalance,
		});
	} catch (err) {
		console.error('Erro ao gerar dados do dashboard:', err);
		return c.json({ error: 'Erro ao gerar dados do dashboard' }, 500);
	}
});

export default dashboardRouter;
