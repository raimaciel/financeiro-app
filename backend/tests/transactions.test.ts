import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-test-123';
const USER_ID = 1;

async function token() {
	return generateToken({ userId: USER_ID, email: 'tx@test.com' }, JWT_SECRET);
}

function makeRequest(path: string, options: { method?: string; body?: any; auth?: string } = {}) {
	const { method = 'GET', body, auth } = options;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (auth) headers['Authorization'] = `Bearer ${auth}`;
	return new Request(`http://localhost${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
}

// Mock de membro com role owner
const memberRow = { role: 'owner' };
// Mock de transação
const txRow = {
	id: 1,
	workspace_id: WORKSPACE_ID,
	user_id: USER_ID,
	category_id: null,
	credit_card_id: null,
	type: 'expense',
	description: 'Supermercado',
	amount: 150.5,
	installments: 1,
	installment_current: 1,
	installment_group_id: null,
	date: '2026-08-15',
	receipt_url: null,
	attachment_name: null,
	attachment_type: null,
	attachment_size: null,
	created_at: '2026-08-15T10:00:00Z',
	category_name: 'Alimentação',
	category_icon: 'utensils',
	category_color: '#FF5733',
	credit_card_name: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Listagem de Transações
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /workspaces/:workspaceId/transactions', () => {
	it('deve retornar 401 sem token', async () => {
		const env = createEnvMock();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar 403 se não for membro do workspace', async () => {
		// DB retorna null para workspace_members → sem acesso
		const env = createEnvMock({ workspace_members: [] });
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`, { auth: tk });
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve retornar lista de transações para membro válido', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			transactions: [txRow],
		});
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`, { auth: tk });
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any[];
		expect(Array.isArray(data)).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Criação de Transação
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /workspaces/:workspaceId/transactions', () => {
	it('deve retornar 403 para viewer', async () => {
		const env = createEnvMock({ workspace_members: [{ role: 'viewer' }] });
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`, {
			method: 'POST',
			body: { type: 'expense', amount: 100, date: '2026-08-15' },
			auth: tk,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve retornar 400 com tipo inválido', async () => {
		const env = createEnvMock({ workspace_members: [memberRow] });
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`, {
			method: 'POST',
			body: { type: 'invalid', amount: 100, date: '2026-08-15' },
			auth: tk,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
	});

	it('deve retornar 400 com valor negativo', async () => {
		const env = createEnvMock({ workspace_members: [memberRow] });
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`, {
			method: 'POST',
			body: { type: 'expense', amount: -50, date: '2026-08-15' },
			auth: tk,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
	});

	it('deve retornar 400 com data em formato inválido', async () => {
		const env = createEnvMock({ workspace_members: [memberRow] });
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`, {
			method: 'POST',
			body: { type: 'expense', amount: 100, date: '15/08/2026' },
			auth: tk,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
	});

	it('deve criar transação simples com sucesso (201)', async () => {
		const env = createEnvMock({ workspace_members: [memberRow] });
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions`, {
			method: 'POST',
			body: {
				type: 'expense',
				amount: 150.5,
				description: 'Supermercado',
				date: '2026-08-15',
				installments: 1,
			},
			auth: tk,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Resumo Mensal
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /workspaces/:workspaceId/transactions/summary', () => {
	it('deve retornar total_income, total_expense e balance', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			transactions: [{ total: 1000 }],
		});
		const tk = await token();
		const req = makeRequest(
			`/workspaces/${WORKSPACE_ID}/transactions/summary?month=2026-08`,
			{ auth: tk }
		);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;
		expect(data).toHaveProperty('total_income');
		expect(data).toHaveProperty('total_expense');
		expect(data).toHaveProperty('balance');
		expect(data).toHaveProperty('by_category');
		expect(Array.isArray(data.by_category)).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Exclusão de Transação
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /workspaces/:workspaceId/transactions/:id', () => {
	it('deve retornar 404 se a transação não existir', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			transactions: [], // nada no banco
		});
		const tk = await token();
		const req = makeRequest(`/workspaces/${WORKSPACE_ID}/transactions/9999`, {
			method: 'DELETE',
			auth: tk,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(404);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Upload de Comprovante (R2)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /workspaces/:workspaceId/transactions/:id/attachment', () => {
	it('deve retornar 400 quando nenhum arquivo for enviado', async () => {
		const env = createEnvMock({ workspace_members: [memberRow], transactions: [txRow] });
		const tk = await token();

		const formData = new FormData(); // sem arquivo

		const req = new Request(
			`http://localhost/workspaces/${WORKSPACE_ID}/transactions/1/attachment`,
			{
				method: 'POST',
				headers: { Authorization: `Bearer ${tk}` },
				body: formData,
			}
		);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
	});

	it('deve retornar 403 para viewer ao tentar upload', async () => {
		const env = createEnvMock({
			workspace_members: [{ role: 'viewer' }],
			transactions: [txRow],
		});
		const tk = await token();
		const form = new FormData();
		form.append('file', new File(['hello'], 'test.jpg', { type: 'image/jpeg' }));
		const req = new Request(
			`http://localhost/workspaces/${WORKSPACE_ID}/transactions/1/attachment`,
			{
				method: 'POST',
				headers: { Authorization: `Bearer ${tk}` },
				body: form,
			}
		);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});
});


