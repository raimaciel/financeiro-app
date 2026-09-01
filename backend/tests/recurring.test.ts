import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-rec-123';
const USER_ID = 1;

async function token() {
	return generateToken({ userId: USER_ID, email: 'recurring@test.com' }, JWT_SECRET);
}

const memberRow = { role: 'owner' };

const recurringRow = {
	id: 'rec-1',
	workspace_id: WORKSPACE_ID,
	user_id: USER_ID,
	description: 'Aluguel Apartamento',
	amount: 1500.0,
	type: 'expense',
	frequency: 'monthly',
	day_of_month: 5,
	start_date: '2026-06-01',
	end_date: null,
	status: 'active',
	last_generated_date: '2026-07-05',
};

describe('Rotas de Transações Recorrentes', () => {
	it('GET /workspaces/:workspaceId/recurring - deve listar recorrências e sumário', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			recurring_transactions: [recurringRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/recurring`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.summary.active_count).toBe(1);
		expect(data.summary.monthly_expenses_total).toBe(1500.0);
		expect(data.recurrings).toHaveLength(1);
		expect(data.recurrings[0].description).toBe('Aluguel Apartamento');
	});

	it('POST /workspaces/:workspaceId/recurring - deve validar campos e criar nova regra', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/recurring`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				description: 'Netflix',
				amount: 55.9,
				type: 'expense',
				start_date: '2026-08-01',
				day_of_month: 15,
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);

		const data = (await res.json()) as any;
		expect(data.recurring.description).toBe('Netflix');
		expect(data.recurring.amount).toBe(55.9);
		expect(data.recurring.day_of_month).toBe(15);
	});

	it('PATCH /workspaces/:workspaceId/recurring/:id/pause - deve alternar status para paused', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			recurring_transactions: [{ id: 'rec-1', status: 'active', workspace_id: WORKSPACE_ID }],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/recurring/rec-1/pause`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.status).toBe('paused');
	});

	it('DELETE /workspaces/:workspaceId/recurring/:id - deve excluir regra', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			recurring_transactions: [recurringRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/recurring/rec-1`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
	});

	it('POST /workspaces/:workspaceId/recurring/generate - deve gerar transações pendentes', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			recurring_transactions: [recurringRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/recurring/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({ targetDate: '2026-08-31' }),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.success).toBe(true);
		expect(data.generated_count).toBe(1); // Mês de agosto gerado
	});

	it('GET /workspaces/:workspaceId/recurring/suggestions - deve retornar sugestões baseadas no histórico', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			transactions: [
				{ id: 1, description: 'Spotify AB', amount: 34.9, type: 'expense', date: '2026-06-10' },
				{ id: 2, description: 'Spotify AB', amount: 34.9, type: 'expense', date: '2026-07-10' },
				{ id: 3, description: 'Spotify AB', amount: 34.9, type: 'expense', date: '2026-08-10' },
			],
			recurring_transactions: [],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/recurring/suggestions`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.suggestions).toHaveLength(1);
		expect(data.suggestions[0].description).toBe('Spotify AB');
		expect(data.suggestions[0].amount).toBe(34.9);
	});
});
