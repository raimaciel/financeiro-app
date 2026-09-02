import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { generateToken } from '../src/auth';

function createMockD1ForInvoiceModal() {
	const transactionsTable = [
		{
			id: 1,
			workspace_id: 'ws-casa',
			user_id: '1',
			category_id: 1,
			credit_card_id: 'card-caixa-2583',
			type: 'expense',
			description: 'NORMATEL HOME CENTER 03 DE 03 FORTALEZA',
			amount: 77.77,
			installments: 3,
			installment_current: 3,
			date: '2026-09-06',
		},
		{
			id: 2,
			workspace_id: 'ws-casa',
			user_id: '1',
			category_id: 2,
			credit_card_id: 'card-caixa-2583',
			type: 'expense',
			description: 'AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR',
			amount: 35.02,
			installments: 4,
			installment_current: 4,
			date: '2026-09-07',
		},
	];

	const categoriesTable = [
		{ id: 1, workspace_id: 'ws-casa', name: 'Casa & Construção', color: '#10B981', icon: 'Home', type: 'expense' },
		{ id: 2, workspace_id: 'ws-casa', name: 'Compras Online', color: '#3B82F6', icon: 'ShoppingBag', type: 'expense' },
	];

	const creditCardsTable = [
		{
			id: 'card-caixa-2583',
			workspace_id: 'ws-casa',
			name: 'Caixa Sim Internacional',
			last_four_digits: '2583',
			brand: 'Visa',
			limit_amount: 5000,
			closing_day: 25,
			due_day: 10,
			color: '#005CA9',
		},
	];

	const invoicesTable: any[] = [];

	return {
		transactionsTable,
		prepare: (query: string) => {
			let boundParams: any[] = [];
			const statement = {
				bind: (...params: any[]) => {
					boundParams = params;
					return statement;
				},
				first: async <T = any>(): Promise<T | null> => {
					if (query.includes('FROM workspace_members')) {
						return { workspace_id: 'ws-casa', role: 'admin' } as any;
					}
					if (query.includes('FROM credit_cards')) {
						const [cId] = boundParams;
						const card = creditCardsTable.find((c) => c.id === cId);
						return (card || null) as any;
					}
					if (query.includes('FROM invoices')) {
						const [cId, refMonth] = boundParams;
						const inv = invoicesTable.find((i) => i.credit_card_id === cId && i.reference_month === refMonth);
						return (inv || null) as any;
					}
					if (query.includes("SUM(amount)") && query.includes("type = 'expense'")) {
						const [wsId, monthPattern] = boundParams;
						const prefix = monthPattern ? monthPattern.replace('%', '') : '';
						const total = transactionsTable
							.filter((t) => (t.workspace_id === wsId || !wsId) && t.type === 'expense' && t.date.startsWith(prefix))
							.reduce((acc, t) => acc + Number(t.amount), 0);
						return { total } as any;
					}
					return null;
				},
				all: async <T = any>(): Promise<{ results: T[] }> => {
					if (query.includes('FROM credit_cards')) {
						return { results: creditCardsTable as any };
					}
					if (query.includes('FROM invoices')) {
						const [cId] = boundParams;
						const list = invoicesTable.filter((i) => i.credit_card_id === cId);
						return { results: list as any };
					}
					if (query.includes('FROM transactions')) {
						const [cId, wsId, dateLike] = boundParams;
						let filtered = transactionsTable.filter((t) => t.credit_card_id === cId && t.workspace_id === wsId);
						if (dateLike && typeof dateLike === 'string' && dateLike.endsWith('%')) {
							const prefix = dateLike.replace('%', '');
							filtered = filtered.filter((t) => t.date.startsWith(prefix));
						}
						return { results: filtered as any };
					}
					return { results: [] };
				},
				run: async () => {
					return { success: true };
				},
			};
			return statement;
		},
	};
}

describe('Card Invoices Modal Sync with Dashboard', () => {
	let mockDb: any;
	const dummyJwtSecret = 'super-secret-jwt-key-for-test-environments-12345';

	beforeEach(() => {
		mockDb = createMockD1ForInvoiceModal();
	});

	async function getAuthToken() {
		return await generateToken({ userId: '1', email: 'carlos@casa.com', name: 'Carlos' }, dummyJwtSecret);
	}

	it('deve listar fatura de Setembro/2026 com total de R$ 112,79 e 2 transações em GET /cards/:id/invoices', async () => {
		const token = await getAuthToken();

		const res = await app.request('/cards/card-caixa-2583/invoices', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(res.status).toBe(200);
		const invoices = await res.json();
		expect(Array.isArray(invoices)).toBe(true);

		const sepInvoice = invoices.find((inv: any) => inv.reference_month === '2026-09');
		expect(sepInvoice).toBeDefined();
		expect(sepInvoice.total_amount).toBe(112.79);
		expect(sepInvoice.transactions_count).toBe(2);
		expect(sepInvoice.due_date).toBe('2026-10-10');
	});

	it('deve trazer detalhes das 2 transações (NORMATEL e AMAZON) em GET /invoices/inv_card-caixa-2583_2026-09', async () => {
		const token = await getAuthToken();

		const res = await app.request('/invoices/inv_card-caixa-2583_2026-09', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(res.status).toBe(200);
		const detail = await res.json();
		expect(detail.reference_month).toBe('2026-09');
		expect(detail.total_amount).toBe(112.79);
		expect(detail.transactions).toHaveLength(2);
		expect(detail.transactions[0].description).toContain('NORMATEL HOME CENTER 03 DE 03');
		expect(detail.transactions[1].description).toContain('AMAZONMKTPLC AMOPERACO 04 DE 04');
	});

	it('deve projetar R$ 112,79 em Setembro/2026 na aba de Previsão Futura (GET /workspaces/:ws/credit-cards/:id/invoice/forecast)', async () => {
		const token = await getAuthToken();

		const res = await app.request('/workspaces/ws-casa/credit-cards/card-caixa-2583/invoice/forecast?months=6', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(res.status).toBe(200);
		const forecastRes = await res.json();
		const sepForecast = forecastRes.forecast.find((f: any) => f.reference_month === '2026-09');
		expect(sepForecast).toBeDefined();
		expect(sepForecast.predicted_total).toBe(112.79);
		expect(sepForecast.items).toHaveLength(2);
	});
});
