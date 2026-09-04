import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';

async function makeToken(userId = 1, email = 'test@example.com') {
	return generateToken({ userId, email }, JWT_SECRET);
}

function makeRequest(
	path: string,
	options: { method?: string; body?: any; token?: string } = {}
) {
	const { method = 'GET', body, token } = options;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (token) headers['Authorization'] = `Bearer ${token}`;

	return new Request(`http://localhost${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Testes de Autenticação
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /register', () => {
	it('deve recusar quando campos obrigatórios estiverem ausentes', async () => {
		const env = createEnvMock();
		const req = makeRequest('/register', { method: 'POST', body: { email: 'x@x.com' } });
		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
		const data = await res.json() as any;
		expect(data.error).toBeDefined();
	});

	it('deve recusar e-mail já cadastrado', async () => {
		const env = createEnvMock({
			users: [{ id: 1, email: 'existing@example.com' }],
			invite_codes: [
				{
					id: 1,
					code: 'INV-TESTE',
					expires_at: new Date(Date.now() + 86400000).toISOString(),
					max_uses: 1,
					uses_count: 0,
				},
			],
		});
		const req = makeRequest('/register', {
			method: 'POST',
			body: { name: 'Test', email: 'existing@example.com', password: '123456', inviteCode: 'INV-TESTE' },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(409);
	});

	it('deve registrar usuário com sucesso e criar workspace padrão automaticamente', async () => {
		const env = createEnvMock({
			users: [],
			invite_codes: [
				{
					id: 1,
					code: 'INV-VALID',
					expires_at: new Date(Date.now() + 86400000).toISOString(),
					max_uses: 5,
					uses_count: 0,
				},
			],
		});
		const req = makeRequest('/register', {
			method: 'POST',
			body: { name: 'Novo Usuário', email: 'novo@example.com', password: 'password123', inviteCode: 'INV-VALID' },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);
		const data = await res.json() as any;
		expect(data.token).toBeDefined();
		expect(data.user.email).toBe('novo@example.com');
	});
});

describe('POST /login', () => {
	it('deve retornar 400 sem email ou senha', async () => {
		const env = createEnvMock();
		const req = makeRequest('/login', { method: 'POST', body: { email: 'x@x.com' } });
		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
	});

	it('deve retornar 401 com usuário inexistente', async () => {
		// Banco retorna null para SELECT user
		const env = createEnvMock({ users: [] });
		const req = makeRequest('/login', {
			method: 'POST',
			body: { email: 'naoexiste@test.com', password: '123456' },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});
});

describe('GET /me', () => {
	it('deve retornar 401 sem token', async () => {
		const env = createEnvMock();
		const req = makeRequest('/me');
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar userId e userEmail com token válido', async () => {
		const env = createEnvMock();
		const token = await makeToken(99, 'me@test.com');
		const req = makeRequest('/me', { token });
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;
		expect(data.userId).toBe(99);
		expect(data.userEmail).toBe('me@test.com');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de Workspaces
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /workspaces', () => {
	it('deve retornar 401 sem token', async () => {
		const env = createEnvMock();
		const req = makeRequest('/workspaces');
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar array de workspaces com token válido', async () => {
		const env = createEnvMock({
			workspace_members: [
				{ id: 'ws-1', name: 'Pessoal', type: 'personal', role: 'owner' },
			],
		});
		const token = await makeToken(1);
		const req = makeRequest('/workspaces', { token });
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;
		expect(Array.isArray(data)).toBe(true);
	});
});

describe('POST /workspaces', () => {
	it('deve recusar criação sem nome', async () => {
		const env = createEnvMock();
		const token = await makeToken(1);
		const req = makeRequest('/workspaces', {
			method: 'POST',
			body: { type: 'personal' },
			token,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
	});
});


