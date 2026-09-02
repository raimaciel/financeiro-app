import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-caixa-123';
const USER_ID = 1;

async function getToken() {
	return generateToken({ userId: USER_ID, email: 'caixa@test.com' }, JWT_SECRET);
}

const memberRow = { workspace_id: WORKSPACE_ID, user_id: USER_ID, role: 'owner' };

const sampleCaixaPdf = `
CAIXA ECONOMICA FEDERAL
Nome do Titular: CARLOS SILVA
CPF: 123.456.789-00
Endereço: RUA DAS PALMEIRAS, 100
Limite de Crédito: R$ 15.000,00
Vencimento: 10/04/2026

(Cartão 1234)
05/03 SUPERMERCADO ABC 154,30D
12/03 UBER *TRIP 25,90D
15/03 ESTORNO COMPRA 80,00C
Total do Cartão 1234 260,20D

(Cartão 5678)
18/03 FARMACIA DROGASIL 94,50D
22/03 AMAZON.COM.BR 1.234,56D
Total dos Lançamentos 1.329,06D
Total a Pagar 1.589,26D
`;

describe('Import Preview & Confirm Endpoints (Caixa PDF com Revisão Manual)', () => {
	it('POST /api/import/preview deve retornar as transações extraídas com dataParcial e precisaRevisao: true sem salvar no banco', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
		});
		const t = await getToken();

		const req = new Request('http://localhost/api/import/preview', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${t}`,
			},
			body: JSON.stringify({
				pdfText: sampleCaixaPdf,
				workspaceId: WORKSPACE_ID,
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const json = await res.json() as any;
		expect(json.success).toBe(true);
		expect(json.precisaRevisao).toBe(true);
		expect(json.totalCount).toBe(5);
		expect(json.transactions).toHaveLength(5);

		// Não infere o ano automaticamente (mantém dataParcial "DD/MM")
		expect(json.transactions[0].dataParcial).toBe('05/03');
		expect(json.transactions[0].descricao).toBe('SUPERMERCADO ABC');
		expect(json.transactions[0].valor).toBe(154.3);
		expect(json.transactions[0].tipo).toBe('D');
		expect(json.transactions[0].cartao).toBe('Cartão 1234');
		expect(json.transactions[0].precisaRevisao).toBe(true);
	});

	it('POST /import/preview deve retornar erro 400 se o texto não contiver transações', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
		});
		const t = await getToken();

		const req = new Request('http://localhost/import/preview', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${t}`,
			},
			body: JSON.stringify({
				pdfText: 'Texto sem nenhuma linha de lançamento de cartão',
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);

		const json = await res.json() as any;
		expect(json.error).toContain('Nenhuma transação válida');
	});

	it('POST /api/import/confirm deve validar e salvar transações com ano preenchido na revisão', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			transactions: [],
		});
		const t = await getToken();

		const reviewedTransactions = [
			{
				dataParcial: '05/03',
				ano: 2026,
				descricao: 'SUPERMERCADO ABC',
				valor: 154.3,
				tipo: 'D',
				cartao: 'Cartão 1234',
				categoryId: 10,
			},
			{
				dataParcial: '15/03',
				ano: 2026,
				descricao: 'ESTORNO COMPRA',
				valor: 80.0,
				tipo: 'C',
				cartao: 'Cartão 1234',
			},
		];

		const req = new Request('http://localhost/api/import/confirm', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${t}`,
			},
			body: JSON.stringify({
				workspaceId: WORKSPACE_ID,
				transactions: reviewedTransactions,
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const json = await res.json() as any;
		expect(json.success).toBe(true);
		expect(json.count).toBe(2);
	});

	it('POST /import/confirm deve recusar se nenhuma transação for enviada', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
		});
		const t = await getToken();

		const req = new Request('http://localhost/import/confirm', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${t}`,
			},
			body: JSON.stringify({
				workspaceId: WORKSPACE_ID,
				transactions: [],
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
	});
});
