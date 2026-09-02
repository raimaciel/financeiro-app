import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { generateToken } from '../src/auth';

// Helper mock D1 completo com suporte a dashboard e transactions
function createEndToEndMockD1() {
	const transactionsTable: any[] = [];
	const categoriesTable = [
		{ id: 1, workspace_id: 'ws-casa', name: 'Casa & Reforma', color: '#10B981', icon: 'Home', type: 'expense' },
	];
	const creditCardsTable = [
		{ id: 'card-uuid-2583', workspace_id: 'ws-casa', name: 'Caixa Sim Internacional', last_four_digits: '2583', brand: 'Visa', limit_amount: 5000, closing_day: 25, due_day: 10, color: '#005CA9' },
	];

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
					if (query.includes("SUM(amount)") && query.includes("type = 'expense'")) {
						const [wsId, monthPattern] = boundParams;
						const prefix = monthPattern ? monthPattern.replace('%', '') : '';
						const total = transactionsTable
							.filter((t) => t.workspace_id === wsId && t.type === 'expense' && t.date.startsWith(prefix))
							.reduce((acc, t) => acc + Number(t.amount), 0);
						return { total } as any;
					}
					if (query.includes("SUM(amount)") && query.includes("type = 'income'")) {
						const [wsId, monthPattern] = boundParams;
						const prefix = monthPattern ? monthPattern.replace('%', '') : '';
						const total = transactionsTable
							.filter((t) => t.workspace_id === wsId && t.type === 'income' && t.date.startsWith(prefix))
							.reduce((acc, t) => acc + Number(t.amount), 0);
						return { total } as any;
					}
					if (query.includes('FROM invoices')) {
						return null;
					}
					return null;
				},
				all: async <T = any>(): Promise<{ results: T[] }> => {
					if (query.includes('FROM categories')) {
						return { results: categoriesTable as any };
					}
					if (query.includes('FROM credit_cards')) {
						return { results: creditCardsTable as any };
					}
					if (query.includes('FROM transactions') && query.includes('GROUP BY')) {
						const [wsId, monthPattern] = boundParams;
						const prefix = monthPattern ? monthPattern.replace('%', '') : '';
						const filtered = transactionsTable.filter((t) => t.workspace_id === wsId && t.type === 'expense' && t.date.startsWith(prefix));
						const total = filtered.reduce((acc, t) => acc + Number(t.amount), 0);
						if (total > 0) {
							return {
								results: [
									{ category_id: 1, name: 'Casa & Reforma', color: '#10B981', icon: 'Home', total },
								] as any,
							};
						}
						return { results: [] };
					}
					if (query.includes('FROM transactions')) {
						const [wsId, monthPattern] = boundParams;
						const prefix = monthPattern ? monthPattern.replace('%', '') : '';
						const filtered = transactionsTable.filter((t) => t.workspace_id === wsId && t.date.startsWith(prefix));
						return { results: filtered as any };
					}
					return { results: [] };
				},
				run: async () => {
					if (query.includes('INSERT INTO transactions')) {
						const [
							workspace_id,
							user_id,
							category_id,
							credit_card_id,
							type,
							description,
							amount,
							installments,
							installment_current,
							date,
							installment_group_id,
						] = boundParams;

						transactionsTable.push({
							id: transactionsTable.length + 1,
							workspace_id,
							user_id,
							category_id,
							credit_card_id,
							type,
							description,
							amount,
							installments,
							installment_current,
							date,
							installment_group_id,
						});
					}
					return { success: true };
				},
			};
			return statement;
		},
		batch: async (statements: any[]) => {
			for (const stmt of statements) {
				await stmt.run();
			}
			return statements.map(() => ({ success: true }));
		},
	};
}

describe('End-to-End Invoice Import to Dashboard Flow (Workspace "Casa")', () => {
	let mockDb: any;
	const dummyJwtSecret = 'super-secret-jwt-key-for-test-environments-12345';

	beforeEach(() => {
		mockDb = createEndToEndMockD1();
	});

	async function getAuthToken() {
		return await generateToken({ userId: '1', email: 'carlos@casa.com', name: 'Carlos' }, dummyJwtSecret);
	}

	it('deve importar fatura Caixa de Setembro/2026 com compra de Junho/2026 e exibir R$ 154,30 no Dashboard de Setembro/2026', async () => {
		const token = await getAuthToken();

		// 1. O usuário faz o upload da fatura Caixa de Setembro/2026
		const caixaPdfText = `
			CAIXA ECONOMICA FEDERAL
			Demonstrativo da Fatura
			Vencimento: 10/09/2026
			Total a Pagar: R$ 154,30

			(Cartão 2583)
			06/06 NORMATEL HOME CENTER 03 DE 03 FORTALEZA 154,30D
		`;

		// 2. Chama POST /api/import/preview
		const previewRes = await app.request('/api/import/preview', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				pdfText: caixaPdfText,
				workspaceId: 'ws-casa',
			}),
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(previewRes.status).toBe(200);
		const previewJson = await previewRes.json();
		expect(previewJson.anoFatura).toBe(2026);
		expect(previewJson.mesFatura).toBe(9);
		expect(previewJson.transactions).toHaveLength(1);

		const tx = previewJson.transactions[0];
		expect(tx.descricao).toBe('NORMATEL HOME CENTER 03 DE 03 FORTALEZA');
		expect(tx.dataTransacao).toBe('06/06'); // Compra original
		expect(tx.date).toBe('2026-09-06'); // Competência Setembro/2026
		expect(tx.creditCardId).toBe('card-uuid-2583'); // Cartão 2583 vinculado automaticamente

		// 3. Usuário clica em "Confirmar Importação" -> envia para POST /api/import/confirm
		const confirmRes = await app.request('/api/import/confirm', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				workspaceId: 'ws-casa',
				transactions: [
					{
						date: tx.date, // 2026-09-06
						dataCompetencia: tx.dataCompetencia,
						dataTransacao: tx.dataTransacao,
						descricao: tx.descricao,
						valor: tx.valor,
						tipo: tx.tipo,
						creditCardId: tx.creditCardId,
						categoryId: 1,
					},
				],
			}),
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(confirmRes.status).toBe(200);
		const confirmJson = await confirmRes.json();
		expect(confirmJson.success).toBe(true);
		expect(confirmJson.count).toBe(1);

		// 4. Verifica diretamente no banco D1 a coluna date
		expect(mockDb.transactionsTable).toHaveLength(1);
		const savedTx = mockDb.transactionsTable[0];
		expect(savedTx.date).toBe('2026-09-06');
		expect(savedTx.description).toBe('NORMATEL HOME CENTER 03 DE 03 FORTALEZA');
		expect(savedTx.amount).toBe(154.3);
		expect(savedTx.credit_card_id).toBe('card-uuid-2583');

		// 5. Consulta o Dashboard de Setembro/2026: GET /workspaces/ws-casa/dashboard?month=2026-09
		const dashRes = await app.request('/workspaces/ws-casa/dashboard?month=2026-09', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(dashRes.status).toBe(200);
		const dashJson = await dashRes.json();
		expect(dashJson.month).toBe('2026-09');

		// O Dashboard DEVE mostrar R$ 154,30 em Despesas do Mês para Setembro/2026!
		expect(dashJson.summary.total_expense).toBe(154.3);
		expect(dashJson.summary.total_income).toBe(0);
		expect(dashJson.summary.balance).toBe(-154.3);
		expect(dashJson.expenses_by_category[0].total).toBe(154.3);
	});
});
