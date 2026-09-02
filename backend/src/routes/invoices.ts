/**
 * =================================================================================================
 * REGRA DE NEGÓCIO UNIFICADA - CÁLCULO DE FATURAS DE CARTÃO DE CRÉDITO
 * 
 * Regra: Toda transação do tipo 'expense' vinculada ao cartão (transactions.credit_card_id = card.id)
 * pertence à fatura do mês de referência X (YYYY-MM) se sua data (transactions.date) pertencer ao mês
 * ('YYYY-MM-%') ou cair dentro da janela de fechamento calculada (start_date <= date <= closing_date).
 * 
 * Essa mesma regra é compartilhada de ponta a ponta com o Dashboard, a Tela de Cartões (CreditCards.tsx)
 * e o Modal de Faturas, garantindo 100% de paridade e eliminando divergências de exibição.
 * =================================================================================================
 */

import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import {
	calculateInvoicePeriod,
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
// 1. GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/current - Fatura do mês atual
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
		const currentMonthRef = formatDateISO(now).slice(0, 7);
		const period = calculateInvoicePeriod(closingDay, dueDay, currentMonthRef, now);

		// 2. Busca transações do cartão da competência atual ou período
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

		const allTxs = rawTransactions || [];
		const currentInvoiceTxs = allTxs.filter((tx) => (tx.date && tx.date.startsWith(currentMonthRef)) || (tx.date >= period.start_date && tx.date <= period.closing_date));
		const currentTotal = currentInvoiceTxs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

		// Verifica status no banco (se já foi marcada como paga)
		const dbInvoice = await db
			.prepare('SELECT id, status, paid_at FROM invoices WHERE credit_card_id = ? AND reference_month = ?')
			.bind(cardId, currentMonthRef)
			.first<any>();

		const isPaid = dbInvoice?.status === 'paid';
		const status = isPaid ? 'paid' : period.status;

		return c.json({
			card: {
				id: card.id,
				name: card.name,
				brand: card.brand,
				color: card.color,
				limit_amount: card.limit_amount,
				closing_day: card.closing_day,
				due_day: card.due_day,
			},
			period,
			current_invoice: {
				id: dbInvoice?.id || `inv_${cardId}_${currentMonthRef}`,
				reference_month: currentMonthRef,
				total_amount: Number(currentTotal.toFixed(2)),
				status,
				paid_at: dbInvoice?.paid_at || null,
				transactions_count: currentInvoiceTxs.length,
			},
			transactions: currentInvoiceTxs,
			// Compatibilidade com campos de nível raiz
			card_id: cardId,
			workspace_id: workspaceId,
			reference_month: currentMonthRef,
			month: period.month,
			year: period.year,
			start_date: period.start_date,
			closing_date: period.closing_date,
			due_date: period.due_date,
			days_until_closing: period.days_until_closing,
			days_until_due: period.days_until_due,
			total_amount: Number(currentTotal.toFixed(2)),
			transactions_count: currentInvoiceTxs.length,
		});
	} catch (err) {
		console.error('Erro ao buscar fatura atual:', err);
		return c.json({ error: 'Erro ao carregar fatura atual' }, 500);
	}
});

// ------------------------------------------------------------------------------------------------
// 2. GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/history - Histórico
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

		const monthsParam = parseInt(c.req.query('months') || '6', 10);
		const monthsCount = Math.min(Math.max(1, monthsParam), 24);

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

		const { results: rawTransactions } = await db
			.prepare(`
				SELECT 
					t.id, t.description, t.amount, t.type, t.date, t.installments, t.installment_current,
					t.installment_group_id, c.name as category_name, c.icon as category_icon, c.color as category_color
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.credit_card_id = ? AND t.workspace_id = ? AND t.type = 'expense'
				ORDER BY t.date DESC
			`)
			.bind(cardId, workspaceId)
			.all<any>();

		const allTxs = rawTransactions || [];

		const { results: dbInvoices } = await db
			.prepare('SELECT id, reference_month, status, paid_at, total_amount FROM invoices WHERE credit_card_id = ?')
			.bind(cardId)
			.all<any>();

		const dbInvoiceMap = new Map<string, any>();
		for (const inv of dbInvoices || []) {
			dbInvoiceMap.set(inv.reference_month, inv);
		}

		const history: any[] = [];
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth() + 1;

		for (let i = 0; i < monthsCount; i++) {
			const d = new Date(currentYear, currentMonth - 1 - i, 1);
			const refMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			const period = calculateInvoicePeriod(closingDay, dueDay, refMonth, now);
			const txs = allTxs.filter((tx) => (tx.date && tx.date.startsWith(refMonth)) || (tx.date >= period.start_date && tx.date <= period.closing_date));
			const total = txs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
			const saved = dbInvoiceMap.get(refMonth);

			history.push({
				id: saved?.id || `inv_${cardId}_${refMonth}`,
				reference_month: refMonth,
				total_amount: Number(total.toFixed(2)),
				status: saved?.status || (period.is_closed_by_date ? 'closed' : 'open'),
				due_date: period.due_date,
				closing_date: period.closing_date,
				transactions_count: txs.length,
			});
		}

		return c.json({
			card_id: cardId,
			workspace_id: workspaceId,
			history,
		});
	} catch (err) {
		console.error('Erro ao buscar histórico de faturas:', err);
		return c.json({ error: 'Erro ao carregar histórico de faturas' }, 500);
	}
});

// ------------------------------------------------------------------------------------------------
// 3. GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/forecast - Previsão futura (parcelas)
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

		const monthsParam = parseInt(c.req.query('months') || '6', 10);
		const monthsAhead = Math.min(Math.max(1, monthsParam), 24);

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

		const { results: rawTransactions } = await db
			.prepare(`
				SELECT 
					t.id, t.description, t.amount, t.type, t.date, t.installments, t.installment_current,
					t.installment_group_id, c.name as category_name, c.icon as category_icon, c.color as category_color
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.credit_card_id = ? AND t.workspace_id = ? AND t.type = 'expense'
				ORDER BY t.date ASC
			`)
			.bind(cardId, workspaceId)
			.all<any>();

		const forecast = calculateInvoiceForecast(closingDay, dueDay, rawTransactions || [], monthsAhead, undefined, now);
		const totalCommitted = forecast.reduce((acc, curr) => acc + curr.predicted_total, 0);

		return c.json({
			card_id: cardId,
			workspace_id: workspaceId,
			card_name: card.name,
			limit_amount: card.limit_amount,
			total_committed_future: Number(totalCommitted.toFixed(2)),
			months_count: monthsAhead,
			forecast,
		});
	} catch (err) {
		console.error('Erro ao calcular previsão de faturas:', err);
		return c.json({ error: 'Erro ao gerar previsão de faturas' }, 500);
	}
});

// ------------------------------------------------------------------------------------------------
// 4. GET /cards/:id/invoices & /workspaces/:workspaceId/cards/:cardId/invoices - Lista Faturas por Mês
// ------------------------------------------------------------------------------------------------
const getCardInvoicesHandler = async (c: any) => {
	try {
		const cardId = c.req.param('id') || c.req.param('cardId');
		const pathWorkspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// 1. Se veio workspaceId no path, valida permissão primeiro
		if (pathWorkspaceId) {
			const role = await getWorkspaceMemberRole(db, pathWorkspaceId, userId);
			if (!role) {
				return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
			}
		}

		// 2. Busca cartão
		const card = await db
			.prepare('SELECT id, workspace_id, name, brand, color, limit_amount, closing_day, due_day FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<any>();

		if (!card) {
			// Se acessado via /cards/:id/invoices e cartão não existe, retorna array vazio
			return c.json([]);
		}

		const workspaceId = card.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const closingDay = Number(card.closing_day);
		const dueDay = Number(card.due_day);
		const now = new Date();

		// 3. Busca faturas registradas no banco (status pago, etc.)
		const { results: dbInvoices } = await db
			.prepare('SELECT id, reference_month, status, paid_at, total_amount FROM invoices WHERE credit_card_id = ?')
			.bind(cardId)
			.all<any>();

		const dbInvoiceMap = new Map<string, any>();
		for (const inv of dbInvoices || []) {
			dbInvoiceMap.set(inv.reference_month, inv);
		}

		// 4. Busca todas as transações desse cartão no workspace
		const { results: rawCardTransactions } = await db
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

		const cardTransactions = rawCardTransactions || [];

		// Coleta todos os meses com transações ou faturas existentes
		const monthsSet = new Set<string>();
		for (const tx of cardTransactions) {
			if (tx.date && typeof tx.date === 'string') {
				monthsSet.add(tx.date.slice(0, 7));
			}
		}
		for (const inv of dbInvoices || []) {
			if (inv.reference_month) {
				monthsSet.add(inv.reference_month);
			}
		}

		// Garante a janela padrão de 6 meses atrás até 6 meses à frente
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth() + 1;
		for (let i = -6; i <= 6; i++) {
			const d = new Date(currentYear, currentMonth - 1 + i, 1);
			const yyyy = d.getFullYear();
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			monthsSet.add(`${yyyy}-${mm}`);
		}

		const targetMonths = Array.from(monthsSet).sort().reverse();

		// 5. Monta lista das faturas calculadas dinamicamente
		const invoices = targetMonths.map((refMonth) => {
			const period = calculateInvoicePeriod(closingDay, dueDay, refMonth, now);
			const txs = cardTransactions.filter((tx) => (tx.date && tx.date.startsWith(refMonth)) || (tx.date >= period.start_date && tx.date <= period.closing_date));
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
};

invoicesRouter.get('/cards/:id/invoices', getCardInvoicesHandler);
invoicesRouter.get('/cards/:cardId/invoices', getCardInvoicesHandler);
invoicesRouter.get('/workspaces/:workspaceId/cards/:cardId/invoices', getCardInvoicesHandler);
invoicesRouter.get('/workspaces/:workspaceId/credit-cards/:cardId/invoices', getCardInvoicesHandler);

// ------------------------------------------------------------------------------------------------
// 5. GET /invoices/:id - Detalhes da fatura com transações
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

		const { results: rawTxs } = await db
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

		const transactions = (rawTxs || []).filter((tx) => (tx.date && tx.date.startsWith(referenceMonth)) || (tx.date >= period.start_date && tx.date <= period.closing_date));
		const totalAmount = transactions.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
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

		const { results: rawTxs } = await db
			.prepare('SELECT amount, date FROM transactions WHERE credit_card_id = ? AND workspace_id = ? AND type = "expense"')
			.bind(cardId, workspaceId)
			.all<any>();

		const txs = (rawTxs || []).filter((tx) => (tx.date && tx.date.startsWith(referenceMonth)) || (tx.date >= period.start_date && tx.date <= period.closing_date));
		const totalAmount = txs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
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
