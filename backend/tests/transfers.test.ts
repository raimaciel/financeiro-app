import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

describe('Account Transfers Router (Fase 4)', () => {
	const USER_ID = 10;
	const USER_EMAIL = 'user@example.com';
	const VIEWER_ID = 20;
	const NON_MEMBER_ID = 99;
	const WORKSPACE_ID = 'ws-test-123';
	const OTHER_WORKSPACE_ID = 'ws-other-456';

	const FROM_ACCOUNT_ID = 'acc-from-1';
	const TO_ACCOUNT_ID = 'acc-to-2';
	const FOREIGN_ACCOUNT_ID = 'acc-foreign-3';

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

	const bankAccounts = [
		{
			id: FROM_ACCOUNT_ID,
			workspace_id: WORKSPACE_ID,
			name: 'Conta Corrente Inter',
			bank_name: 'Banco Inter',
			account_type: 'checking',
			initial_balance: 5000,
			color: '#FF7A00',
			status: 'active',
		},
		{
			id: TO_ACCOUNT_ID,
			workspace_id: WORKSPACE_ID,
			name: 'Poupança Caixa',
			bank_name: 'Caixa',
			account_type: 'savings',
			initial_balance: 1000,
			color: '#005CA9',
			status: 'active',
		},
		{
			id: FOREIGN_ACCOUNT_ID,
			workspace_id: OTHER_WORKSPACE_ID,
			name: 'Conta Nubank Outro WS',
			bank_name: 'Nubank',
			account_type: 'checking',
			initial_balance: 200,
			color: '#820AD1',
			status: 'active',
		},
	];

	beforeEach(async () => {
		token = await generateToken({ userId: USER_ID, email: USER_EMAIL }, 'test-secret-key-for-unit-tests-1234567890');
		viewerToken = await generateToken({ userId: VIEWER_ID, email: 'viewer@example.com' }, 'test-secret-key-for-unit-tests-1234567890');
		nonMemberToken = await generateToken({ userId: NON_MEMBER_ID, email: 'stranger@example.com' }, 'test-secret-key-for-unit-tests-1234567890');
	});

	function makeRequest(path: string, options: { method?: string; body?: any; token?: string } = {}) {
		const { method = 'GET', body, token: tk } = options;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (tk) headers['Authorization'] = `Bearer ${tk}`;
		return new Request(`http://localhost${path}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});
	}

	it('POST /workspaces/:id/transfers - deve criar transferência entre duas contas do mesmo workspace', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			account_transfers: [],
		});

		const payload = {
			from_account_id: FROM_ACCOUNT_ID,
			to_account_id: TO_ACCOUNT_ID,
			amount: 500,
			description: 'Reserva do mês',
			date: '2026-09-05',
		};

		const res = await app.fetch(makeRequest(`/workspaces/${WORKSPACE_ID}/transfers`, { method: 'POST', body: payload, token }), env);
		expect(res.status).toBe(201);
		const data = await res.json() as any;

		expect(data).toHaveProperty('id');
		expect(data.from_account_id).toBe(FROM_ACCOUNT_ID);
		expect(data.to_account_id).toBe(TO_ACCOUNT_ID);
		expect(data.amount).toBe(500);
		expect(data.description).toBe('Reserva do mês');
		expect(data.from_account_name).toBe('Conta Corrente Inter');
		expect(data.to_account_name).toBe('Poupança Caixa');
	});

	it('POST /workspaces/:id/transfers - deve rejeitar se conta de origem e destino forem iguais (400)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			account_transfers: [],
		});

		const payload = {
			from_account_id: FROM_ACCOUNT_ID,
			to_account_id: FROM_ACCOUNT_ID,
			amount: 300,
			date: '2026-09-05',
		};

		const res = await app.fetch(makeRequest(`/workspaces/${WORKSPACE_ID}/transfers`, { method: 'POST', body: payload, token }), env);
		expect(res.status).toBe(400);
		const data = await res.json() as any;
		expect(data.error).toContain('diferentes');
	});

	it('POST /workspaces/:id/transfers - deve rejeitar se conta pertencer a outro workspace (400)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			account_transfers: [],
		});

		const payload = {
			from_account_id: FROM_ACCOUNT_ID,
			to_account_id: FOREIGN_ACCOUNT_ID,
			amount: 300,
			date: '2026-09-05',
		};

		const res = await app.fetch(makeRequest(`/workspaces/${WORKSPACE_ID}/transfers`, { method: 'POST', body: payload, token }), env);
		expect(res.status).toBe(400);
		const data = await res.json() as any;
		expect(data.error).toContain('workspace');
	});

	it('POST /workspaces/:id/transfers - deve rejeitar valor menor ou igual a zero (400)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			account_transfers: [],
		});

		const payload = {
			from_account_id: FROM_ACCOUNT_ID,
			to_account_id: TO_ACCOUNT_ID,
			amount: -50,
			date: '2026-09-05',
		};

		const res = await app.fetch(makeRequest(`/workspaces/${WORKSPACE_ID}/transfers`, { method: 'POST', body: payload, token }), env);
		expect(res.status).toBe(400);
	});

	it('POST /workspaces/:id/transfers - deve proibir papel "viewer" (403)', async () => {
		const env = createEnvMock({
			workspace_members: [viewerMemberRow],
			bank_accounts: bankAccounts,
			account_transfers: [],
		});

		const payload = {
			from_account_id: FROM_ACCOUNT_ID,
			to_account_id: TO_ACCOUNT_ID,
			amount: 100,
			date: '2026-09-05',
		};

		const res = await app.fetch(makeRequest(`/workspaces/${WORKSPACE_ID}/transfers`, { method: 'POST', body: payload, token: viewerToken }), env);
		expect(res.status).toBe(403);
	});

	it('GET /workspaces/:id/transfers - deve listar transferências com filtros', async () => {
		const mockTransfers = [
			{
				id: 'tr-1',
				workspace_id: WORKSPACE_ID,
				from_account_id: FROM_ACCOUNT_ID,
				to_account_id: TO_ACCOUNT_ID,
				amount: 750,
				description: 'Aporte',
				date: '2026-09-01',
			},
		];

		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			account_transfers: mockTransfers,
		});

		const res = await app.fetch(makeRequest(`/workspaces/${WORKSPACE_ID}/transfers?accountId=${FROM_ACCOUNT_ID}`, { token }), env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(Array.isArray(data)).toBe(true);
		expect(data).toHaveLength(1);
		expect(data[0].amount).toBe(750);
		expect(data[0].from_account_name).toBe('Conta Corrente Inter');
		expect(data[0].to_account_name).toBe('Poupança Caixa');
	});

	it('DELETE /workspaces/:id/transfers/:id - deve excluir transferência com sucesso', async () => {
		const mockTransfers = [
			{
				id: 'tr-to-delete',
				workspace_id: WORKSPACE_ID,
				from_account_id: FROM_ACCOUNT_ID,
				to_account_id: TO_ACCOUNT_ID,
				amount: 200,
				date: '2026-09-02',
			},
		];

		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			account_transfers: mockTransfers,
		});

		const res = await app.fetch(makeRequest(`/workspaces/${WORKSPACE_ID}/transfers/tr-to-delete`, { method: 'DELETE', token }), env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;
		expect(data.message).toContain('sucesso');
	});
});
