import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-budget-123';
const USER_ID = 1;

async function token() {
	return generateToken({ userId: USER_ID, email: 'budget@test.com' }, JWT_SECRET);
}

const memberRow = { role: 'owner' };

const budgetRow = {
	id: 'b-1',
	workspace_id: WORKSPACE_ID,
	category_id: 10,
	category_name: 'Alimentação',
	category_icon: 'Utensils',
	category_color: '#FF5733',
	monthly_limit: 800.0,
	month_reference: null,
	alert_threshold_percent: 80,
};

const goalRow = {
	id: 'g-1',
	workspace_id: WORKSPACE_ID,
	user_id: USER_ID,
	name: 'Reserva de Emergência',
	target_amount: 5000.0,
	current_amount: 2500.0,
	target_date: '2026-12-31',
	status: 'active',
};

describe('Rotas de Orçamentos e Metas de Economia', () => {
	it('GET /workspaces/:workspaceId/budgets - deve calcular gastos, percentual e status de alerta', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			budgets: [budgetRow],
			transactions: [
				{ category_id: 10, total_spent: 700.0 }, // 700 / 800 = 87.5% -> warning
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets?month=2026-08`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.summary.total_budgeted).toBe(800.0);
		expect(data.summary.total_spent).toBe(700.0);
		expect(data.summary.warning_count).toBe(1);
		expect(data.budgets).toHaveLength(1);
		expect(data.budgets[0].percentage_used).toBe(87.5);
		expect(data.budgets[0].status).toBe('warning');
	});

	it('POST /workspaces/:workspaceId/budgets - deve definir orçamento para categoria', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				category_id: 10,
				monthly_limit: 1200.0,
				alert_threshold_percent: 85,
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);

		const data = (await res.json()) as any;
		expect(data.message).toContain('Orçamento definido');
	});

	it('DELETE /workspaces/:workspaceId/budgets/:id - deve remover orçamento', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			budgets: [budgetRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets/b-1`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
	});

	it('GET /workspaces/:workspaceId/goals - deve listar metas com cálculo de progresso', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			savings_goals: [goalRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.summary.total_goals).toBe(1);
		expect(data.summary.overall_percentage).toBe(50.0);
		expect(data.goals[0].progress_percentage).toBe(50.0);
		expect(data.goals[0].remaining_amount).toBe(2500.0);
	});

	it('POST /workspaces/:workspaceId/goals - deve criar meta de economia', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				name: 'Viagem Japão',
				target_amount: 15000.0,
				current_amount: 1000.0,
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);

		const data = (await res.json()) as any;
		expect(data.goal.name).toBe('Viagem Japão');
		expect(data.goal.target_amount).toBe(15000.0);
	});

	it('PATCH /workspaces/:workspaceId/goals/:id/deposit - deve somar depósito e concluir meta se atingir alvo', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			savings_goals: [{ id: 'g-1', target_amount: 1000.0, current_amount: 900.0 }],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/goals/g-1/deposit`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({ amount: 150.0 }), // 900 + 150 = 1050 >= 1000 -> completed
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.current_amount).toBe(1050.0);
		expect(data.status).toBe('completed');
	});
});
