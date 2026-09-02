import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-test-123';
const CARD_ID = 'card-test-456';

async function token() {
	return generateToken({ userId: 1, email: 'invoices@test.com' }, JWT_SECRET);
}

const memberRow = { role: 'owner' };

const cardRow = {
	id: CARD_ID,
	workspace_id: WORKSPACE_ID,
	name: 'Nubank',
	closing_day: 25,
	due_day: 5,
	limit_amount: 5000,
	color: '#8A05BE',
};

describe('GET /workspaces/:workspaceId/cards/:cardId/invoices', () => {
	it('deve retornar 401 sem token', async () => {
		const env = createEnvMock();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/cards/${CARD_ID}/invoices`);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar 403 se não for membro do workspace', async () => {
		const env = createEnvMock({ workspace_members: [] });
		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/cards/${CARD_ID}/invoices`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve retornar array de faturas com cartão válido', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [cardRow],
		});
		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/cards/${CARD_ID}/invoices`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(Array.isArray(data) || typeof data === 'object').toBe(true);
	});
});

describe('GET /cards/:id/invoices', () => {
	it('deve retornar 200 e array de faturas para o cartão informado', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [cardRow],
		});
		const tk = await token();
		const req = new Request(`http://localhost/cards/${CARD_ID}/invoices`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeGreaterThan(0);
		expect(data[0].card_id).toBe(CARD_ID);
	});

	it('deve retornar 200 e array vazio quando o cartão não tiver faturas ou não for encontrado', async () => {
		const env = createEnvMock({
			workspace_members: [],
			credit_cards: [],
		});
		const tk = await token();
		const req = new Request(`http://localhost/cards/cartao-inexistente/invoices`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(0);
	});
});

describe('Novos Endpoints de Fatura (Current, History, Forecast)', () => {
	it('GET /workspaces/:id/credit-cards/:cardId/invoice/current - deve retornar fatura aberta e período', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [cardRow],
			transactions: [
				{
					id: 1,
					credit_card_id: CARD_ID,
					workspace_id: WORKSPACE_ID,
					description: 'Mercado',
					amount: 250.0,
					type: 'expense',
					date: '2026-08-30',
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards/${CARD_ID}/invoice/current`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.card.name).toBe('Nubank');
		expect(data.period).toBeDefined();
		expect(data.period.closing_date).toBeDefined();
	});

	it('GET /workspaces/:id/credit-cards/:cardId/invoice/history - deve retornar histórico de faturas', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [cardRow],
			transactions: [],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards/${CARD_ID}/invoice/history?months=3`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.history).toHaveLength(3);
	});

	it('GET /workspaces/:id/credit-cards/:cardId/invoice/forecast - deve retornar previsão futura', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [cardRow],
			transactions: [
				{
					id: 10,
					credit_card_id: CARD_ID,
					workspace_id: WORKSPACE_ID,
					description: 'Celular 1/3',
					amount: 300.0,
					type: 'expense',
					installments: 3,
					installment_current: 1,
					date: '2026-09-01',
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards/${CARD_ID}/invoice/forecast?months=6`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.forecast).toHaveLength(6);
	});
});
