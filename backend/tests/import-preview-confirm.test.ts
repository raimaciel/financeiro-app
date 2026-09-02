import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { generateToken } from '../src/auth';

// Helper mock simples para D1
function createMockD1() {
	const data: any[] = [];
	return {
		data,
		prepare: (query: string) => {
			let boundParams: any[] = [];
			const statement = {
				bind: (...params: any[]) => {
					boundParams = params;
					return statement;
				},
				first: async <T = any>(): Promise<T | null> => {
					if (query.includes('FROM workspace_members')) {
						return { workspace_id: boundParams[0] || 'ws-test', role: 'admin' } as any;
					}
					return null;
				},
				all: async <T = any>(): Promise<{ results: T[] }> => {
					if (query.includes('FROM categories')) {
						return {
							results: [
								{ id: 1, name: 'Alimentação', type: 'expense' },
								{ id: 2, name: 'Transporte', type: 'expense' },
							] as any,
						};
					}
					if (query.includes('FROM credit_cards')) {
						return {
							results: [
								{ id: 'card-uuid-2583', name: 'Caixa Sim Internacional', last_four_digits: '2583', brand: 'Visa' },
								{ id: 'card-uuid-2424', name: 'Caixa Sim Internacional', last_four_digits: '2424', brand: 'Visa' },
							] as any,
						};
					}
					return { results: [] };
				},
				run: async () => {
					if (query.includes('INSERT INTO transactions')) {
						data.push({ query, boundParams });
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

describe('Import Endpoints: Preview & Confirm (Caixa Manual Review & Fixes)', () => {
	let mockDb: any;
	const dummyJwtSecret = 'super-secret-jwt-key-for-test-environments-12345';

	beforeEach(() => {
		mockDb = createMockD1();
	});

	async function getAuthToken() {
		return await generateToken({ userId: '1', email: 'teste@teste.com', name: 'Teste' }, dummyJwtSecret);
	}

	it('POST /api/import/preview deve retornar lançamentos com descrição integral, competência e vinculação automática por 4 dígitos', async () => {
		const token = await getAuthToken();

		const pdfText = `
			CAIXA ECONOMICA FEDERAL
			Vencimento: 10/09/2026

			(Cartão 2583)
			06/06 NORMATEL HOME CENTER 03 DE 03 FORTALEZA 150,00D
			07/05 AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR 89,90D

			(Cartão 9999)
			12/08 RESTAURANTE SABOR 45,00D
		`;

		const res = await app.request('/api/import/preview', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				pdfText,
				workspaceId: 'ws-test',
			}),
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.totalCount).toBe(3);
		expect(json.precisaRevisao).toBe(true);
		expect(json.anoFatura).toBe(2026);
		expect(json.mesFatura).toBe(9);

		// Item 1: Descrição completa e cartão 2583 vinculado automaticamente
		expect(json.transactions[0]).toMatchObject({
			dataTransacao: '06/06',
			dataCompetencia: '2026-09-06',
			descricao: 'NORMATEL HOME CENTER 03 DE 03 FORTALEZA',
			valor: 150.0,
			tipo: 'D',
			cartaoDigitos: '2583',
			creditCardId: 'card-uuid-2583',
			cartaoIdentificado: true,
		});

		// Item 2: Descrição completa
		expect(json.transactions[1]).toMatchObject({
			dataTransacao: '07/05',
			dataCompetencia: '2026-09-07',
			descricao: 'AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR',
			valor: 89.9,
			creditCardId: 'card-uuid-2583',
			cartaoIdentificado: true,
		});

		// Item 3: Cartão 9999 não existente no cadastro -> cartaoIdentificado = false
		expect(json.transactions[2]).toMatchObject({
			dataTransacao: '12/08',
			cartaoDigitos: '9999',
			creditCardId: null,
			cartaoIdentificado: false,
		});
	});

	it('POST /api/import/confirm deve salvar dados no banco usando data de competência da fatura', async () => {
		const token = await getAuthToken();

		const res = await app.request('/api/import/confirm', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				workspaceId: 'ws-test',
				transactions: [
					{
						dataTransacao: '06/06',
						dataCompetencia: '2026-09-06',
						descricao: 'NORMATEL HOME CENTER 03 DE 03 FORTALEZA',
						valor: 150.0,
						tipo: 'D',
						creditCardId: 'card-uuid-2583',
						categoryId: 1,
					},
					{
						dataTransacao: '07/05',
						dataCompetencia: '2026-09-07',
						descricao: 'AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR',
						valor: 89.9,
						tipo: 'D',
						creditCardId: 'card-uuid-2583',
						categoryId: 1,
					},
				],
			}),
		}, {
			financeiro_db: mockDb,
			JWT_SECRET: dummyJwtSecret,
		} as any);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.count).toBe(2);

		expect(mockDb.data).toHaveLength(2);
		expect(mockDb.data[0].boundParams[9]).toBe('2026-09-06');
		expect(mockDb.data[0].boundParams[5]).toBe('NORMATEL HOME CENTER 03 DE 03 FORTALEZA');
		expect(mockDb.data[0].boundParams[3]).toBe('card-uuid-2583');
	});
});
