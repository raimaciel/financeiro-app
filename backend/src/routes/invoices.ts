import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import {
	calculateInvoicePeriod,
	getInvoiceMonthForTransaction,
	calculateInvoiceForecast,
	formatDateISO,
} from '../utils/invoiceCalculator';

const invoicesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de faturas com authMiddleware
invoicesRouter.use('*', authMiddleware);

// Helper para verificar o papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// ------------------------------------------------------------------------------------------------
// 1. GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/current - Fatura do mês atual (aberta/vigente)
// ------------------------------------------------------------------------------------------------
invoicesRouter.get('/workspaces/:workspaceId/credit-cards/:cardId/invoice/current', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const cardId = c.req.param('cardId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		// 1. Busca cartão
		const card = await db
			.prepare('SELECT id, name, brand, color, limit_amount, closing_day, due_day FROM credit_cards WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const closingDay = Number(card.closing_day);
		const dueDay = Number(card.due_day);
		const now = new Date();
		const currentMonthRef = getInvoiceMonthForTransaction(formatDateISO(now), closingDay);
		const period = calculateInvoicePeriod(closingDay, dueDay, currentMonthRef, now);

		// 2. Busca todas as transações do cartão
		const { results: rawTransactions } = await db
			.prepare(`
				SELECT 
					t.id, t.description, t.amount, t.type, t.date, t.installments, t.installment_current,
					t.installment_group_id, c.name as category_name, c.icon as category_icon, c.color as category_color
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.credit_card_id = ? AND t.workspace_id = ? AND t.type = 'expense'
				ORDER BY t.date DESC, t.id DESC
			`)
			.bind(cardId, workspaceId)
			.all<any>();

		const allCardTxs = rawTransactions || [];

		// Transações que caem na fatura atual
		const currentInvoiceTxs = allCardTxs.filter((tx) => {
			return tx.date >= period.start_date && tx.date <= period.closing_date;
		});

		// Transações lançadas após o fechamento (que vão para a próxima fatura)
		const nextInvoiceTxs = allCardTxs.filter((tx) => {
			return tx.date > period.closing_date;
		});

		const currentTotal = currentInvoiceTxs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
		const nextTotal = nextInvoiceTxs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

		// Verifica status no banco (se já foi marcada como paga)
		const dbInvoice = await db
			.prepare('SELECT id, status, paid_at FROM invoices WHERE credit_card_id = ? AND reference_month = ?')
			.bind(cardId, currentMonthRef)
			.first<any>();

		let status = period.status;
		if (dbInvoice && dbInvoice.status === 'paid') {
			status = 'paid' as any;
		}

		return c.json({
			card: {
				id: card.id,
				name: card.name,
				brand: card.brand,
				color: card.color,
				limit_amount: card.limit_amount,
				closing_day: closingDay,
				due_day: dueDay,
			},
			period,
			status,
			total_amount: Number(currentTotal.toFixed(2)),
			next_cycle_open_amount: Number(nextTotal.toFixed(2)),
			transactions_count: currentInvoiceTxs.length,
			paid_at: dbInvoice?.paid_at || null,
			transactions: currentInvoiceTxs,
		});
	} catch (err: any) {
		console.error('Erro ao buscar fatura atual:', err);
		return c.json({ error: 'Erro ao buscar fatura atual do cartão' }, 500);
	}
});

// ------------------------------------------------------------------------------------------------
// 2. GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/history - Histórico de faturas anteriores
// ------------------------------------------------------------------------------------------------
invoicesRouter.get('/workspaces/:workspaceId/credit-cards/:cardId/invoice/history', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const cardId = c.req.param('cardId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const monthsCount = Math.min(24, Math.max(1, parseInt(c.req.query('months') || '6', 10)));

		const card = await db
			.prepare('SELECT id, name, brand, color, closing_day, due_day FROM credit_cards WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const closingDay = Number(card.closing_day);
		const dueDay = Number(card.due_day);
		const now = new Date();

		// Busca todas as transações do cartão
		const { results: rawTransactions } = await db
			.prepare(`
				SELECT 
					t.id, t.description, t.amount, t.type, t.date, t.installments, t.installment_current,
					c.name as category_name, c.color as category_color
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.credit_card_id = ? AND t.workspace_id = ? AND t.type = 'expense'
				ORDER BY t.date DESC
			`)
			.bind(cardId, workspaceId)
			.all<any>();

		const allCardTxs = rawTransactions || [];

		// Busca faturas salvas no banco
		const { results: dbInvoices } = await db
			.prepare('SELECT id, reference_month, status, paid_at FROM invoices WHERE credit_card_id = ?')
			.bind(cardId)
			.all<any>();

		const dbInvoiceMap = new Map<string, { id: string; status: string; paid_at: string | null }>();
		(dbInvoices || []).forEach((inv) => {
			dbInvoiceMap.set(inv.reference_month, { id: inv.id, status: inv.status, paid_at: inv.paid_at });
		});

		// Gera os últimos N meses anteriores ao mês corrente
		const historyList = [];
		const currentMonthRef = getInvoiceMonthForTransaction(formatDateISO(now), closingDay);
		const [curY, curM] = currentMonthRef.split('-').map(Number);

		for (let offset = 1; offset <= monthsCount; offset++) {
			const d = new Date(curY, curM - 1 - offset, 1);
			const refMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			const period = calculateInvoicePeriod(closingDay, dueDay, refMonth, now);

			const txs = allCardTxs.filter((tx) => tx.date >= period.start_date && tx.date <= period.closing_date);
			const totalAmount = txs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

			const saved = dbInvoiceMap.get(refMonth);
			let status = saved?.status || (period.is_closed_by_date ? 'closed' : 'open');

			historyList.push({
				id: saved?.id || `inv_${cardId}_${refMonth}`,
				reference_month: refMonth,
				period,
				total_amount: Number(totalAmount.toFixed(2)),
				status,
				paid_at: saved?.paid_at || null,
				transactions_count: txs.length,
			});
		}

		return c.json({
			card_id: cardId,
			card_name: card.name,
			months: monthsCount,
			history: historyList,
		});
	} catch (err: any) {
		console.error('Erro ao buscar histórico de faturas:', err);
		return c.json({ error: 'Erro ao buscar histórico de faturas' }, 500);
	}
});

// ------------------------------------------------------------------------------------------------
// 3. GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/forecast - Previsão de faturas futuras
// ------------------------------------------------------------------------------------------------
invoicesRouter.get('/workspaces/:workspaceId/credit-cards/:cardId/invoice/forecast', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const cardId = c.req.param('cardId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const monthsCount = Math.min(24, Math.max(1, parseInt(c.req.query('months') || '6', 10)));

		const card = await db
			.prepare('SELECT id, name, brand, color, limit_amount, closing_day, due_day FROM credit_cards WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const closingDay = Number(card.closing_day);
		const dueDay = Number(card.due_day);
		const now = new Date();

		// Busca todas as transações do cartão
		const { results: rawTransactions } = await db
			.prepare(`
				SELECT 
					t.id, t.description, t.amount, t.type, t.date, t.installments, t.installment_current,
					t.installment_group_id, c.name as category_name, c.color as category_color
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.credit_card_id = ? AND t.workspace_id = ? AND t.type = 'expense'
				ORDER BY t.date ASC
			`)
			.bind(cardId, workspaceId)
			.all<any>();

		const forecast = calculateInvoiceForecast(closingDay, dueDay, rawTransactions || [], monthsCount, undefined, now);

		const totalCommittedFuture = forecast.reduce((acc, m) => acc + m.predicted_total, 0);

		return c.json({
			card_id: cardId,
			card_name: card.name,
			limit_amount: card.limit_amount,
			total_committed_future: Number(totalCommittedFuture.toFixed(2)),
			months_ahead: monthsCount,
			forecast,
		});
	} catch (err: any) {
		console.error('Erro ao calcular previsão de faturas:', err);
		return c.json({ error: 'Erro ao calcular previsão de faturas' }, 500);
	}
});

// ------------------------------------------------------------------------------------------------
// 4. GET /workspaces/:workspaceId/cards/:cardId/invoices - Legado/compatibilidade
// ------------------------------------------------------------------------------------------------
invoicesRouter.get('/workspaces/:workspaceId/cards/:cardId/invoices', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const cardId = c.req.param('cardId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const card = await db
			.prepare('SELECT id, name, brand, color, limit_amount, closing_day, due_day FROM credit_cards WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const closingDay = Number(card.closing_day);
		const dueDay = Number(card.due_day);
		const now = new Date();

		const { results: cardTransactions } = await db
			.prepare(`
				SELECT 
					t.id, t.description, t.amount, t.type, t.date, t.installments, t.installment_current,
					t.installment_group_id, c.name as category_name, c.icon as category_icon, c.color as category_color
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.credit_card_id = ? AND t.workspace_id = ?
				ORDER BY t.date DESC
			`)
			.bind(cardId, workspaceId)
			.all<any>();

		const { results: dbInvoices } = await db
			.prepare('SELECT id, reference_month, status, paid_at FROM invoices WHERE credit_card_id = ?')
			.bind(cardId)
			.all<any>();

		const dbInvoiceMap = new Map<string, { id: string; status: string; paid_at: string | null }>();
		(dbInvoices || []).forEach((inv) => {
			dbInvoiceMap.set(inv.reference_month, { id: inv.id, status: inv.status, paid_at: inv.paid_at });
		});

		const monthsSet = new Set<string>();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth() + 1;

		for (let offset = -4; offset <= 6; offset++) {
			const d = new Date(currentYear, currentMonth - 1 + offset, 1);
			const ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			monthsSet.add(ref);
		}

		(cardTransactions || []).forEach((tx) => {
			const ref = getInvoiceMonthForTransaction(tx.date, closingDay);
			monthsSet.add(ref);
		});

		const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));

		const invoices = sortedMonths.map((refMonth) => {
			const period = calculateInvoicePeriod(closingDay, dueDay, refMonth, now);
			const txs = (cardTransactions || []).filter((tx) => tx.date >= period.start_date && tx.date <= period.closing_date);
			const totalAmount = txs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
			const saved = dbInvoiceMap.get(refMonth);
			let status = saved?.status || (period.is_closed_by_date ? 'closed' : 'open');

			return {
				id: saved?.id || `inv_${cardId}_${refMonth}`,
				card_id: cardId,
				workspace_id: workspaceId,
				reference_month: refMonth,
				month: period.month,
				year: period.year,
				start_date: period.start_date,
				closing_date: period.closing_date,
				due_date: period.due_date,
				days_until_due: period.days_until_due,
				total_amount: Number(totalAmount.toFixed(2)),
				status,
				paid_at: saved?.paid_at || null,
				transactions_count: txs.length,
				card_name: card.name,
				card_brand: card.brand,
				card_color: card.color,
			};
		});

		return c.json(invoices);
	} catch (err) {
		console.error('Erro ao listar faturas:', err);
		return c.json({ error: 'Erro ao listar faturas do cartão' }, 500);
	}
});

// ------------------------------------------------------------------------------------------------
// 5. GET /invoices/:id & /workspaces/:workspaceId/invoices/:id - Detalhes da fatura com transações
// ------------------------------------------------------------------------------------------------
const getInvoiceDetailHandler = async (c: any) => {
	try {
		const invoiceId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		let cardId: string | null = null;
		let referenceMonth: string | null = null;
		let savedStatus: string | null = null;
		let savedPaidAt: string | null = null;

		if (invoiceId.startsWith('inv_')) {
			const parts = invoiceId.split('_');
			if (parts.length >= 3) {
				cardId = parts[1];
				referenceMonth = parts[2];
			}
		} else {
			const inv = await db
				.prepare('SELECT id, credit_card_id, reference_month, workspace_id, status, paid_at FROM invoices WHERE id = ?')
				.bind(invoiceId)
				.first<any>();

			if (inv) {
				cardId = inv.credit_card_id;
				referenceMonth = inv.reference_month;
				savedStatus = inv.status;
				savedPaidAt = inv.paid_at;
			}
		}

		if (!cardId || !referenceMonth) {
			return c.json({ error: 'Fatura não encontrada' }, 404);
		}

		const card = await db
			.prepare('SELECT id, workspace_id, name, brand, color, limit_amount, closing_day, due_day FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão não encontrado' }, 404);
		}

		const workspaceId = card.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const closingDay = Number(card.closing_day);
		const dueDay = Number(card.due_day);
		const now = new Date();
		const period = calculateInvoicePeriod(closingDay, dueDay, referenceMonth, now);

		const { results: transactions } = await db
			.prepare(`
				SELECT 
					t.id, t.description, t.amount, t.type, t.date, t.installments, t.installment_current,
					t.installment_group_id, c.name as category_name, c.icon as category_icon, c.color as category_color
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.credit_card_id = ? AND t.workspace_id = ? AND t.date >= ? AND t.date <= ?
				ORDER BY t.date DESC, t.id DESC
			`)
			.bind(cardId, workspaceId, period.start_date, period.closing_date)
			.all<any>();

		const totalAmount = (transactions || []).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
		let status = savedStatus || (period.is_closed_by_date ? 'closed' : 'open');

		return c.json({
			id: invoiceId,
			card_id: cardId,
			workspace_id: workspaceId,
			reference_month: referenceMonth,
			month: period.month,
			year: period.year,
			start_date: period.start_date,
			closing_date: period.closing_date,
			due_date: period.due_date,
			days_until_due: period.days_until_due,
			total_amount: Number(totalAmount.toFixed(2)),
			status,
			paid_at: savedPaidAt,
			card_name: card.name,
			card_brand: card.brand,
			card_color: card.color,
			transactions: transactions || [],
		});
	} catch (err) {
		console.error('Erro ao obter detalhes da fatura:', err);
		return c.json({ error: 'Erro ao buscar detalhes da fatura' }, 500);
	}
};

invoicesRouter.get('/invoices/:id', getInvoiceDetailHandler);
invoicesRouter.get('/workspaces/:workspaceId/invoices/:id', getInvoiceDetailHandler);

// ------------------------------------------------------------------------------------------------
// 6. POST /invoices/:id/pay - Marcar fatura como paga
// ------------------------------------------------------------------------------------------------
invoicesRouter.post('/invoices/:id/pay', async (c) => {
	try {
		const invoiceId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		let cardId: string | null = null;
		let referenceMonth: string | null = null;
		let workspaceId: string | null = null;

		if (invoiceId.startsWith('inv_')) {
			const parts = invoiceId.split('_');
			if (parts.length >= 3) {
				cardId = parts[1];
				referenceMonth = parts[2];
			}
		} else {
			const inv = await db
				.prepare('SELECT id, credit_card_id, reference_month, workspace_id FROM invoices WHERE id = ?')
				.bind(invoiceId)
				.first<any>();

			if (inv) {
				cardId = inv.credit_card_id;
				referenceMonth = inv.reference_month;
				workspaceId = inv.workspace_id;
			}
		}

		if (!cardId || !referenceMonth) {
			return c.json({ error: 'Fatura não encontrada' }, 404);
		}

		const card = await db
			.prepare('SELECT id, workspace_id, closing_day, due_day FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão não encontrado' }, 404);
		}

		workspaceId = card.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId!, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const closingDay = Number(card.closing_day);
		const dueDay = Number(card.due_day);
		const now = new Date();
		const period = calculateInvoicePeriod(closingDay, dueDay, referenceMonth, now);

		const { results: txs } = await db
			.prepare('SELECT amount FROM transactions WHERE credit_card_id = ? AND workspace_id = ? AND date >= ? AND date <= ?')
			.bind(cardId, workspaceId, period.start_date, period.closing_date)
			.all<any>();

		const totalAmount = (txs || []).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
		const nowISO = new Date().toISOString();

		const existing = await db
			.prepare('SELECT id FROM invoices WHERE credit_card_id = ? AND reference_month = ?')
			.bind(cardId, referenceMonth)
			.first<any>();

		if (existing) {
			await db
				.prepare('UPDATE invoices SET status = "paid", paid_at = ?, total_amount = ? WHERE id = ?')
				.bind(nowISO, totalAmount, existing.id)
				.run();
		} else {
			const id = crypto.randomUUID();
			await db
				.prepare(`
					INSERT INTO invoices (id, credit_card_id, workspace_id, reference_month, closing_date, due_date, total_amount, status, paid_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?)
				`)
				.bind(id, cardId, workspaceId, referenceMonth, period.closing_date, period.due_date, totalAmount, nowISO)
				.run();
		}

		return c.json({ message: 'Fatura marcada como paga com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao pagar fatura:', err);
		return c.json({ error: 'Erro ao processar pagamento da fatura' }, 500);
	}
});

export default invoicesRouter;
