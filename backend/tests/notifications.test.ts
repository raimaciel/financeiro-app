import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-test-123';

async function token() {
	return generateToken({ userId: 1, email: 'notifications@test.com' }, JWT_SECRET);
}

const memberRow = { role: 'owner' };

describe('GET /workspaces/:workspaceId/notifications', () => {
	it('deve retornar 401 sem autenticação', async () => {
		const env = createEnvMock();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar 403 se usuário não for membro do workspace', async () => {
		const env = createEnvMock({ workspace_members: [] });
		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve retornar notificações calculadas com sucesso', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			budgets: [
				{
					id: 'b1',
					workspace_id: WORKSPACE_ID,
					category_id: 10,
					monthly_limit: 500,
					alert_threshold_percent: 80,
				},
			],
			categories: [
				{
					id: 10,
					workspace_id: WORKSPACE_ID,
					name: 'Restaurante',
				},
			],
			transactions: [
				{
					id: 1,
					workspace_id: WORKSPACE_ID,
					category_id: 10,
					amount: 600,
					type: 'expense',
					date: new Date().toISOString().slice(0, 10),
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.workspace_id).toBe(WORKSPACE_ID);
		expect(data.total_count).toBeGreaterThan(0);
		expect(data.notifications[0].type).toBe('budget_exceeded');
	});
});
