import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-budget-123';
const OTHER_WORKSPACE_ID = 'ws-other-456';
const USER_ID = 1;

async function token(userId = USER_ID) {
	return generateToken({ userId, email: `user${userId}@test.com` }, JWT_SECRET);
}

const memberRow = { role: 'owner', user_id: String(USER_ID), workspace_id: WORKSPACE_ID };
const viewerRow = { role: 'viewer', user_id: '2', workspace_id: WORKSPACE_ID };

const categoryRow = {
	id: 10,
	workspace_id: WORKSPACE_ID,
	name: 'Alimentação',
	icon: 'Utensils',
	color: '#FF5733',
	type: 'expense',
};

describe('Rotas de Orçamentos por Categoria - Fase 10', () => {
	it('1. deve calcular gastos, percentual consumido e status de alerta (ok, warning, exceeded)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			categories: [
				categoryRow,
				{ id: 20, workspace_id: WORKSPACE_ID, name: 'Lazer', icon: 'Film', color: '#10b981', type: 'expense' },
				{ id: 30, workspace_id: WORKSPACE_ID, name: 'Transporte', icon: 'Car', color: '#3b82f6', type: 'expense' },
			],
			budgets: [
				{
					id: 'b-warning',
					workspace_id: WORKSPACE_ID,
					category_id: 10,
					limit_amount: 1000.0,
					monthly_limit: 1000.0,
					month: '2026-10',
					alert_threshold_percent: 80,
				},
				{
					id: 'b-exceeded',
					workspace_id: WORKSPACE_ID,
					category_id: 20,
					limit_amount: 500.0,
					monthly_limit: 500.0,
					month: '2026-10',
					alert_threshold_percent: 80,
				},
				{
					id: 'b-ok',
					workspace_id: WORKSPACE_ID,
					category_id: 30,
					limit_amount: 600.0,
					monthly_limit: 600.0,
					month: '2026-10',
					alert_threshold_percent: 80,
				},
			],
			transactions: [
				{ workspace_id: WORKSPACE_ID, category_id: 10, amount: 850.0, type: 'expense', date: '2026-10-05' }, // 85% -> warning
				{ workspace_id: WORKSPACE_ID, category_id: 20, amount: 550.0, type: 'expense', date: '2026-10-08' }, // 110% -> exceeded
				{ workspace_id: WORKSPACE_ID, category_id: 30, amount: 200.0, type: 'expense', date: '2026-10-12' }, // 33.3% -> ok
			],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets?month=2026-10`, {
			headers: { Authorization: `Bearer ${tk}` },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data = (await res.json()) as any;
		expect(data.month).toBe('2026-10');
		expect(data.summary.total_budgeted).toBe(2100.0);
		expect(data.summary.total_spent).toBe(1600.0);
		expect(data.summary.total_remaining).toBe(500.0);
		expect(data.summary.warning_count).toBe(1);
		expect(data.summary.exceeded_count).toBe(1);
		expect(data.summary.ok_count).toBe(1);

		const bWarning = data.budgets.find((b: any) => b.category_id === 10);
		expect(bWarning.status).toBe('warning');
		expect(bWarning.percentage_used).toBe(85.0);

		const bExceeded = data.budgets.find((b: any) => b.category_id === 20);
		expect(bExceeded.status).toBe('exceeded');
		expect(bExceeded.percentage_used).toBe(110.0);

		const bOk = data.budgets.find((b: any) => b.category_id === 30);
		expect(bOk.status).toBe('ok');
		expect(bOk.percentage_used).toBe(33.3);
	});

	it('2. deve criar e atualizar (upsert) orçamento para o mesmo mês e categoria', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			categories: [categoryRow],
			budgets: [],
		});
		const tk = await token();

		// Criação inicial
		const postReq1 = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				category_id: 10,
				limit_amount: 1000.0,
				month: '2026-10',
				alert_threshold_percent: 80,
			}),
		});

		const postRes1 = await app.fetch(postReq1, env);
		expect(postRes1.status).toBe(201);
		const postData1 = (await postRes1.json()) as any;
		expect(postData1.message).toContain('definido');
		const budgetId = postData1.id;

		// Upsert: atualiza o mesmo mês e categoria
		const postReq2 = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				category_id: 10,
				limit_amount: 1500.0,
				month: '2026-10',
				alert_threshold_percent: 85,
			}),
		});

		const postRes2 = await app.fetch(postReq2, env);
		expect(postRes2.status).toBe(200);
		const postData2 = (await postRes2.json()) as any;
		expect(postData2.message).toContain('atualizado');
		expect(postData2.id).toBe(budgetId);
	});

	it('3. deve excluir orçamento existente e rejeitar exclusão com permissão de viewer', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow, viewerRow],
			budgets: [
				{
					id: 'b-del',
					workspace_id: WORKSPACE_ID,
					category_id: 10,
					limit_amount: 800.0,
					monthly_limit: 800.0,
				},
			],
		});

		// Tentativa com viewer -> 403
		const tkViewer = await token(2);
		const viewerDelReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets/b-del`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tkViewer}` },
		});
		const viewerDelRes = await app.fetch(viewerDelReq, env);
		expect(viewerDelRes.status).toBe(403);

		// Sucesso com owner -> 200
		const tkOwner = await token(1);
		const ownerDelReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets/b-del`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tkOwner}` },
		});
		const ownerDelRes = await app.fetch(ownerDelReq, env);
		expect(ownerDelRes.status).toBe(200);
	});

	it('4. deve barrar acesso de usuário que não pertence ao workspace', async () => {
		const env = createEnvMock({
			workspace_members: [
				{ role: 'owner', user_id: '1', workspace_id: WORKSPACE_ID },
			],
			budgets: [],
		});
		const tkUser2 = await token(2);

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/budgets`, {
			headers: { Authorization: `Bearer ${tkUser2}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});
});
