import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-dashboard-123';

async function token() {
	return generateToken({ userId: 1, email: 'dash@test.com' }, JWT_SECRET);
}

const memberRow = { role: 'owner' };

function request(path: string, tk: string) {
	return new Request(`http://localhost${path}`, {
		headers: { Authorization: `Bearer ${tk}` },
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /workspaces/:workspaceId/dashboard', () => {
	it('deve retornar 401 sem token', async () => {
		const env = createEnvMock();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/dashboard`);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar 403 se não for membro do workspace', async () => {
		const env = createEnvMock({ workspace_members: [] });
		const tk = await token();
		const res = await app.fetch(request(`/workspaces/${WORKSPACE_ID}/dashboard`, tk), env);
		expect(res.status).toBe(403);
	});

	it('deve retornar estrutura completa do dashboard', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			transactions: [{ total: 500 }],
			credit_cards: [],
		});
		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard?month=2026-08`, tk),
			env
		);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		// Shape check — todos os campos obrigatórios devem estar presentes
		expect(data).toHaveProperty('month');
		expect(data).toHaveProperty('summary');
		expect(data).toHaveProperty('evolution_last_6_months');
		expect(data).toHaveProperty('expenses_by_category');
		expect(data).toHaveProperty('top_expenses');
		expect(data).toHaveProperty('cards_summary');
		expect(data).toHaveProperty('invoices_summary');
	});

	it('deve conter campos de summary com tipos corretos', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
		});
		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard`, tk),
			env
		);
		const data = await res.json() as any;
		const s = data.summary;

		expect(typeof s.total_income).toBe('number');
		expect(typeof s.total_expense).toBe('number');
		expect(typeof s.balance).toBe('number');
		expect(typeof s.income_change_percent).toBe('number');
		expect(typeof s.expense_change_percent).toBe('number');
	});

	it('deve conter array evolution_last_6_months com 6 meses', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
		});
		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard`, tk),
			env
		);
		const data = await res.json() as any;
		expect(Array.isArray(data.evolution_last_6_months)).toBe(true);
		expect(data.evolution_last_6_months).toHaveLength(6);
	});

	it('deve aceitar query param month', async () => {
		const env = createEnvMock({ workspace_members: [memberRow], credit_cards: [] });
		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard?month=2025-12`, tk),
			env
		);
		expect(res.status).toBe(200);
		const data = await res.json() as any;
		expect(data.month).toBe('2025-12');
	});

	it('cards_summary deve ter campos numéricos', async () => {
		const env = createEnvMock({ workspace_members: [memberRow], credit_cards: [] });
		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard`, tk),
			env
		);
		const data = await res.json() as any;
		const cs = data.cards_summary;
		expect(typeof cs.total_limit).toBe('number');
		expect(typeof cs.used_limit).toBe('number');
		expect(typeof cs.available_limit).toBe('number');
		expect(typeof cs.usage_percentage).toBe('number');
	});
});


