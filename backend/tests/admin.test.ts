import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

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

describe('Controle de Acesso - Código de Convite (POST /register)', () => {
	it('deve recusar cadastro quando o código de convite for inválido', async () => {
		const env = createEnvMock({ users: [], invite_codes: [] });
		const req = makeRequest('/register', {
			method: 'POST',
			body: {
				name: 'Novo Usuário',
				email: 'novo@test.com',
				password: 'password123',
				inviteCode: 'CODIGO_ERRADO',
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
		const data = (await res.json()) as any;
		expect(data.error).toContain('Código de convite');
	});

	it('deve recusar cadastro quando o código de convite estiver ausente', async () => {
		const env = createEnvMock({ users: [], invite_codes: [] });
		const req = makeRequest('/register', {
			method: 'POST',
			body: {
				name: 'Novo Usuário',
				email: 'novo@test.com',
				password: 'password123',
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
		const data = (await res.json()) as any;
		expect(data.error.toLowerCase()).toContain('código de convite');
	});

	it('deve aceitar cadastro quando o código for válido via tabela invite_codes', async () => {
		const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		const env = createEnvMock({
			users: [],
			invite_codes: [
				{
					id: 1,
					code: 'INV-VALIDO1',
					expires_at: futureDate,
					max_uses: 1,
					uses_count: 0,
				},
			],
		});

		const req = makeRequest('/register', {
			method: 'POST',
			body: {
				name: 'Novo Usuário',
				email: 'novo@test.com',
				password: 'password123',
				inviteCode: 'INV-VALIDO1',
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);
		const data = (await res.json()) as any;
		expect(data.token).toBeDefined();
		expect(data.user.email).toBe('novo@test.com');
	});

	it('deve recusar cadastro quando o código na tabela invite_codes estiver expirado', async () => {
		const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const env = createEnvMock({
			users: [],
			invite_codes: [
				{
					id: 2,
					code: 'INV-EXPIRADO',
					expires_at: pastDate,
					max_uses: 1,
					uses_count: 0,
				},
			],
		});

		const req = makeRequest('/register', {
			method: 'POST',
			body: {
				name: 'Novo Usuário',
				email: 'novo@test.com',
				password: 'password123',
				inviteCode: 'INV-EXPIRADO',
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
		const data = (await res.json()) as any;
		expect(data.error).toContain('expirado');
	});

	it('deve recusar cadastro quando o código na tabela invite_codes já tiver atingido max_uses', async () => {
		const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		const env = createEnvMock({
			users: [],
			invite_codes: [
				{
					id: 3,
					code: 'INV-ESGOTADO',
					expires_at: futureDate,
					max_uses: 1,
					uses_count: 1,
				},
			],
		});

		const req = makeRequest('/register', {
			method: 'POST',
			body: {
				name: 'Novo Usuário',
				email: 'novo@test.com',
				password: 'password123',
				inviteCode: 'INV-ESGOTADO',
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
		const data = (await res.json()) as any;
		expect(data.error).toContain('esgotou o limite');
	});

	it('deve aceitar cadastro quando o código for digitado em minúsculas (case-insensitive)', async () => {
		const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		const env = createEnvMock({
			users: [],
			invite_codes: [
				{
					id: 4,
					code: 'INV-UPPERCASE',
					expires_at: futureDate,
					max_uses: 1,
					uses_count: 0,
				},
			],
		});
		const req = makeRequest('/register', {
			method: 'POST',
			body: {
				name: 'Novo Usuário',
				email: 'novo@test.com',
				password: 'password123',
				inviteCode: 'inv-uppercase',
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);
		const data = (await res.json()) as any;
		expect(data.token).toBeDefined();
		expect(data.user.email).toBe('novo@test.com');
		expect(data.user.is_active).toBe(true);
	});
});

describe('Controle de Acesso - Bloqueio de Usuários (POST /login & authMiddleware)', () => {
	it('deve impedir login de usuário bloqueado (is_active = 0)', async () => {
		const env = createEnvMock({
			users: [
				{
					id: 10,
					name: 'Bloqueado',
					email: 'bloqueado@test.com',
					password_hash: 'hash',
					is_active: 0,
					is_admin: 0,
				},
			],
		});

		const req = makeRequest('/login', {
			method: 'POST',
			body: { email: 'bloqueado@test.com', password: '123' },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
		const data = (await res.json()) as any;
		expect(data.error).toBe('Sua conta foi bloqueada. Contate o administrador.');
	});

	it('deve bloquear requisição autenticada caso o usuário esteja com is_active = 0', async () => {
		const env = createEnvMock({
			users: [
				{
					id: 10,
					name: 'Bloqueado',
					email: 'bloqueado@test.com',
					is_active: 0,
					is_admin: 0,
				},
			],
		});

		const token = await makeToken(10, 'bloqueado@test.com');
		const req = makeRequest('/me', { token });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(403);
		const data = (await res.json()) as any;
		expect(data.error).toBe('Sua conta foi bloqueada. Contate o administrador.');
	});
});

describe('Rotas Administrativas (/admin/users & /admin/invite-codes)', () => {
	it('deve proibir acesso a GET /admin/users para usuários não-administradores', async () => {
		const env = createEnvMock({
			users: [
				{
					id: 5,
					name: 'Comum',
					email: 'comum@test.com',
					is_active: 1,
					is_admin: 0,
				},
			],
		});

		const token = await makeToken(5, 'comum@test.com');
		const req = makeRequest('/admin/users', { token });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(403);
		const data = (await res.json()) as any;
		expect(data.error).toContain('Apenas administradores');
	});

	it('deve permitir listagem de usuários para administrador', async () => {
		const mockUsers = [
			{ id: 1, name: 'Admin', email: 'admin@test.com', is_active: 1, is_admin: 1, created_at: '2026-08-01' },
			{ id: 2, name: 'User 2', email: 'user2@test.com', is_active: 0, is_admin: 0, created_at: '2026-08-02' },
		];
		const env = createEnvMock({ users: mockUsers });

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/users', { token });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(2);
		expect(data[0].email).toBe('admin@test.com');
		expect(data[0].is_admin).toBe(true);
		expect(data[1].is_active).toBe(false);
	});

	it('deve impedir que o administrador bloqueie a si mesmo', async () => {
		const env = createEnvMock({
			users: [
				{ id: 1, name: 'Admin', email: 'admin@test.com', is_active: 1, is_admin: 1 },
			],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/users/1/toggle-status', {
			method: 'PATCH',
			token,
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
		const data = (await res.json()) as any;
		expect(data.error).toContain('não pode bloquear sua própria conta');
	});

	it('deve permitir gerar um novo código de convite (POST /admin/invite-codes)', async () => {
		const env = createEnvMock({
			users: [{ id: 1, name: 'Admin', email: 'admin@test.com', is_active: 1, is_admin: 1 }],
			invite_codes: [],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/invite-codes', {
			method: 'POST',
			token,
			body: { hoursValid: 48, maxUses: 5 },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);
		const data = (await res.json()) as any;
		expect(data.inviteCode).toBeDefined();
		expect(data.inviteCode.code).toMatch(/^INV-/);
		expect(data.inviteCode.max_uses).toBe(5);
	});

	it('deve permitir listar os códigos de convite (GET /admin/invite-codes)', async () => {
		const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		const env = createEnvMock({
			users: [{ id: 1, name: 'Admin', email: 'admin@test.com', is_active: 1, is_admin: 1 }],
			invite_codes: [
				{
					id: 1,
					code: 'INV-TESTE1',
					expires_at: futureDate,
					max_uses: 2,
					uses_count: 0,
					created_at: '2026-08-30T10:00:00Z',
				},
			],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/invite-codes', { token });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(Array.isArray(data)).toBe(true);
		expect(data[0].code).toBe('INV-TESTE1');
		expect(data[0].status).toBe('ativo');
	});

	it('deve permitir revogar um código de convite (DELETE /admin/invite-codes/:id)', async () => {
		const env = createEnvMock({
			users: [{ id: 1, name: 'Admin', email: 'admin@test.com', is_active: 1, is_admin: 1 }],
			invite_codes: [
				{ id: 1, code: 'INV-TESTE1', expires_at: new Date().toISOString(), max_uses: 1, uses_count: 0 },
			],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/invite-codes/1', {
			method: 'DELETE',
			token,
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.message).toContain('revogado');
	});
});

describe('Edição de Usuários pelo Administrador (PATCH /admin/users/:id)', () => {
	it('deve atualizar com sucesso o nome, is_active e promover a is_admin', async () => {
		const env = createEnvMock({
			users: [
				{ id: 1, name: 'Admin User', email: 'admin@test.com', is_active: 1, is_admin: 1 },
				{ id: 2, name: 'Carlos Teste', email: 'carlos@test.com', is_active: 1, is_admin: 0 },
			],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/users/2', {
			method: 'PATCH',
			token,
			body: {
				name: 'Carlos Promovido',
				is_active: true,
				is_admin: true,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.message).toBe('Usuário atualizado com sucesso');
		expect(data.user.name).toBe('Carlos Promovido');
		expect(data.user.is_admin).toBe(true);
		expect(data.user.is_active).toBe(true);
	});

	it('deve ignorar campo email mesmo se fornecido no payload', async () => {
		const env = createEnvMock({
			users: [
				{ id: 1, name: 'Admin User', email: 'admin@test.com', is_active: 1, is_admin: 1 },
				{ id: 2, name: 'Maria Silva', email: 'maria@test.com', is_active: 1, is_admin: 0 },
			],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/users/2', {
			method: 'PATCH',
			token,
			body: {
				name: 'Maria Atualizada',
				email: 'hacked@test.com',
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any;
		expect(data.user.name).toBe('Maria Atualizada');
		expect(data.user.email).toBe('maria@test.com'); // Não mudou
	});

	it('deve retornar 404 para usuário inexistente', async () => {
		const env = createEnvMock({
			users: [{ id: 1, name: 'Admin', email: 'admin@test.com', is_active: 1, is_admin: 1 }],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/users/999', {
			method: 'PATCH',
			token,
			body: { name: 'Novo Nome' },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(404);
		const data = (await res.json()) as any;
		expect(data.error).toBe('Usuário não encontrado');
	});

	it('deve retornar 400 se o nome for inválido (menos de 2 caracteres)', async () => {
		const env = createEnvMock({
			users: [
				{ id: 1, name: 'Admin', email: 'admin@test.com', is_active: 1, is_admin: 1 },
				{ id: 2, name: 'João', email: 'joao@test.com', is_active: 1, is_admin: 0 },
			],
		});

		const token = await makeToken(1, 'admin@test.com');
		const req = makeRequest('/admin/users/2', {
			method: 'PATCH',
			token,
			body: { name: 'A' },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
		const data = (await res.json()) as any;
		expect(data.error).toContain('pelo menos 2 caracteres');
	});

	it('deve recusar requisição de usuário que não é administrador (403)', async () => {
		const env = createEnvMock({
			users: [
				{ id: 2, name: 'Usuário Comum', email: 'comum@test.com', is_active: 1, is_admin: 0 },
				{ id: 3, name: 'Outro Usuário', email: 'outro@test.com', is_active: 1, is_admin: 0 },
			],
		});

		const token = await makeToken(2, 'comum@test.com');
		const req = makeRequest('/admin/users/3', {
			method: 'PATCH',
			token,
			body: { name: 'Hacker' },
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});
});
