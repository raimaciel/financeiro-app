import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-test-123';
const USER_ID = 1;

async function token() {
	return generateToken({ userId: USER_ID, email: 'workspace@test.com' }, JWT_SECRET);
}

describe('Rotas de Workspaces - GET /workspaces/:id', () => {
	it('deve retornar 401 se não estiver autenticado', async () => {
		const env = createEnvMock();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}`);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar 404 se o workspace não existir', async () => {
		const env = createEnvMock({
			workspace_members: [],
			workspaces: [],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/ws-inexistente`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(404);
		const data = (await res.json()) as any;
		expect(data.error).toContain('não encontrado');
	});

	it('deve retornar 403 se o usuário não for membro do workspace', async () => {
		const env = createEnvMock({
			workspace_members: [],
			workspaces: [
				{
					id: WORKSPACE_ID,
					name: 'Meu Workspace Privado',
					type: 'personal',
					created_at: '2026-08-01',
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve retornar os dados do workspace com sucesso se o usuário for membro', async () => {
		const env = createEnvMock({
			workspace_members: [
				{
					id: 'wm-1',
					workspace_id: WORKSPACE_ID,
					user_id: USER_ID,
					role: 'owner',
				},
			],
			workspaces: [
				{
					id: WORKSPACE_ID,
					name: 'Meu Workspace Pessoal',
					type: 'personal',
					created_at: '2026-08-01',
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.id).toBe(WORKSPACE_ID);
		expect(data.name).toBe('Meu Workspace Pessoal');
		expect(data.role).toBe('owner');
	});
});
