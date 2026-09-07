import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-goal-123';
const OTHER_WORKSPACE_ID = 'ws-other-456';
const USER_ID = 1;

async function token(userId = USER_ID) {
	return generateToken({ userId, email: `user${userId}@test.com` }, JWT_SECRET);
}

const memberRow = { role: 'owner', user_id: String(USER_ID), workspace_id: WORKSPACE_ID };
const viewerRow = { role: 'viewer', user_id: '2', workspace_id: WORKSPACE_ID };

const accountRow = {
	id: 'acc-1',
	workspace_id: WORKSPACE_ID,
	name: 'Reserva Nubank',
	color: '#8b5cf6',
	bank_name: 'Nubank',
};

describe('Rotas de Metas Financeiras - Fase 10', () => {
	it('1. deve criar uma nova meta financeira com conta vinculada e prazo', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [accountRow],
			financial_goals: [],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				name: 'Viagem para a Europa',
				target_amount: 15000.0,
				current_amount: 2500.0,
				deadline: '2027-01-01',
				account_id: 'acc-1',
				color: '#3b82f6',
				icon: 'Plane',
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);

		const data = (await res.json()) as any;
		expect(data.message).toContain('criada com sucesso');
		expect(data.goal.name).toBe('Viagem para a Europa');
		expect(data.goal.target_amount).toBe(15000.0);
		expect(data.goal.current_amount).toBe(2500.0);
		expect(data.goal.status).toBe('active');
		expect(data.goal.account_id).toBe('acc-1');
	});

	it('2. deve listar metas com cálculo de percentual, valor restante e dias restantes', async () => {
		const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [accountRow],
			financial_goals: [
				{
					id: 'g-1',
					workspace_id: WORKSPACE_ID,
					name: 'Reserva de Emergência',
					target_amount: 10000.0,
					current_amount: 4000.0, // 40%
					deadline: futureDate,
					account_id: 'acc-1',
					status: 'active',
				},
				{
					id: 'g-2',
					workspace_id: WORKSPACE_ID,
					name: 'Celular Novo',
					target_amount: 3000.0,
					current_amount: 3000.0, // 100%
					status: 'completed',
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals`, {
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.summary.total_goals).toBe(2);
		expect(data.summary.active_goals).toBe(1);
		expect(data.summary.completed_goals).toBe(1);
		expect(data.summary.total_target_amount).toBe(13000.0);
		expect(data.summary.total_saved_amount).toBe(7000.0);
		expect(data.summary.overall_percentage).toBe(53.8);

		const g1 = data.goals.find((g: any) => g.id === 'g-1');
		expect(g1.progress_percentage).toBe(40.0);
		expect(g1.remaining_amount).toBe(6000.0);
		expect(g1.days_remaining).toBeGreaterThanOrEqual(9);
		expect(g1.account_name).toBe('Reserva Nubank');
	});

	it('3. deve registrar aporte somando ao current_amount e concluir automaticamente se atingir o alvo', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			financial_goals: [
				{
					id: 'g-aporte',
					workspace_id: WORKSPACE_ID,
					name: 'Notebook',
					target_amount: 5000.0,
					current_amount: 4500.0,
					status: 'active',
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals/g-aporte`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({ amount: 600.0 }), // 4500 + 600 = 5100 >= 5000 -> completed
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.current_amount).toBe(5100.0);
		expect(data.status).toBe('completed');
		expect(data.message).toContain('atingida com sucesso');
	});

	it('4. deve marcar meta como completed manualmente via PATCH /complete', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			financial_goals: [
				{
					id: 'g-manual',
					workspace_id: WORKSPACE_ID,
					name: 'Curso',
					target_amount: 1000.0,
					current_amount: 800.0,
					status: 'active',
				},
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals/g-manual/complete`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.status).toBe('completed');
	});

	it('5. deve excluir meta financeira via DELETE e validar permissões', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow, viewerRow],
			financial_goals: [
				{
					id: 'g-del',
					workspace_id: WORKSPACE_ID,
					name: 'Meta a Deletar',
					target_amount: 1000.0,
					current_amount: 0,
					status: 'active',
				},
			],
		});

		// Tentativa com viewer -> 403
		const tkViewer = await token(2);
		const viewerReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals/g-del`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tkViewer}` },
		});
		const viewerRes = await app.fetch(viewerReq, env);
		expect(viewerRes.status).toBe(403);

		// Sucesso com owner -> 200
		const tkOwner = await token(1);
		const ownerReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals/g-del`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tkOwner}` },
		});
		const ownerRes = await app.fetch(ownerReq, env);
		expect(ownerRes.status).toBe(200);
	});

	it('6. deve barrar acesso a metas de outro workspace', async () => {
		const env = createEnvMock({
			workspace_members: [
				{ role: 'owner', user_id: '1', workspace_id: WORKSPACE_ID },
				{ role: 'owner', user_id: '2', workspace_id: OTHER_WORKSPACE_ID },
			],
			financial_goals: [
				{
					id: 'g-other',
					workspace_id: OTHER_WORKSPACE_ID,
					name: 'Meta Privada',
					target_amount: 10000.0,
					current_amount: 1000.0,
					status: 'active',
				},
			],
		});

		const tkUser1 = await token(1);

		const req = new Request(`http://localhost/workspaces/${OTHER_WORKSPACE_ID}/goals`, {
			headers: { Authorization: `Bearer ${tkUser1}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});
});
