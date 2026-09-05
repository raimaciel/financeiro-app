import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

describe('Bank Accounts Router (Fase 1: Cadastro de Bancos/Contas)', () => {
	const USER_ID = 10;
	const USER_EMAIL = 'user@example.com';
	const VIEWER_ID = 20;
	const NON_MEMBER_ID = 99;
	const WORKSPACE_ID = 'ws-test-123';
	const ACCOUNT_ID = 'acc-uuid-1';

	let token: string;
	let viewerToken: string;
	let nonMemberToken: string;

	const memberRow = {
		id: 'wm-1',
		workspace_id: WORKSPACE_ID,
		user_id: String(USER_ID),
		role: 'owner',
	};

	const viewerMemberRow = {
		id: 'wm-2',
		workspace_id: WORKSPACE_ID,
		user_id: String(VIEWER_ID),
		role: 'viewer',
	};

	const existingAccountRow = {
		id: ACCOUNT_ID,
		workspace_id: WORKSPACE_ID,
		name: 'Conta Principal Inter',
		bank_name: 'Banco Inter',
		account_type: 'checking',
		initial_balance: 1500.50,
		color: '#FF7A00',
		status: 'active',
		created_at: '2026-09-01T10:00:00Z',
		updated_at: '2026-09-01T10:00:00Z',
	};

	beforeEach(async () => {
		token = await generateToken({ userId: USER_ID, email: USER_EMAIL }, 'test-secret-key-for-unit-tests-1234567890');
		viewerToken = await generateToken({ userId: VIEWER_ID, email: 'viewer@example.com' }, 'test-secret-key-for-unit-tests-1234567890');
		nonMemberToken = await generateToken({ userId: NON_MEMBER_ID, email: 'stranger@example.com' }, 'test-secret-key-for-unit-tests-1234567890');
	});

	it('POST /workspaces/:id/accounts - deve criar conta bancária com sucesso', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [],
		});

		const payload = {
			name: 'Nubank Reserva',
			bank_name: 'Nubank',
			account_type: 'savings',
			initial_balance: 5000,
			color: '#820AD1',
		};

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);

		const data: any = await res.json();
		expect(data.name).toBe('Nubank Reserva');
		expect(data.bank_name).toBe('Nubank');
		expect(data.account_type).toBe('savings');
		expect(data.initial_balance).toBe(5000);
		expect(data.color).toBe('#820AD1');
		expect(data.status).toBe('active');
		expect(data.id).toBeDefined();
	});

	it('POST /workspaces/:id/accounts - deve rejeitar criação por membro viewer', async () => {
		const env = createEnvMock({
			workspace_members: [viewerMemberRow],
			bank_accounts: [],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${viewerToken}`,
			},
			body: JSON.stringify({ name: 'Conta Teste' }),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('POST /workspaces/:id/accounts - deve rejeitar criação por não membro', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${nonMemberToken}`,
			},
			body: JSON.stringify({ name: 'Conta Inválida' }),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('POST /workspaces/:id/accounts - deve validar obrigatoriedade do nome', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ name: '' }),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
		const data: any = await res.json();
		expect(data.error).toContain('Nome da conta é obrigatório');
	});

	it('POST /workspaces/:id/accounts - deve validar tipo de conta inválido', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ name: 'Minha Conta', account_type: 'invalid_type' }),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);
		const data: any = await res.json();
		expect(data.error).toContain('Tipo de conta inválido');
	});

	it('GET /workspaces/:id/accounts - deve listar contas do workspace', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [existingAccountRow],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(1);
		expect(data[0].id).toBe(ACCOUNT_ID);
		expect(data[0].name).toBe('Conta Principal Inter');
	});

	it('GET /workspaces/:id/accounts/:id - deve retornar conta por ID', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [existingAccountRow],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(data.id).toBe(ACCOUNT_ID);
		expect(data.bank_name).toBe('Banco Inter');
	});

	it('GET /workspaces/:id/accounts/:id - deve retornar 404 quando conta não existe', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/inexistente`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(404);
	});

	it('PUT /workspaces/:id/accounts/:id - deve atualizar conta com sucesso', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [{ ...existingAccountRow }],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				name: 'Inter Atualizado',
				initial_balance: 2000,
				status: 'archived',
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(data.name).toBe('Inter Atualizado');
		expect(data.initial_balance).toBe(2000);
		expect(data.status).toBe('archived');
	});

	it('DELETE /workspaces/:id/accounts/:id - deve remover conta', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [{ ...existingAccountRow }],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data: any = await res.json();
		expect(data.message).toContain('removida com sucesso');
	});
});
