import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

describe('Reports Router (Fase 7)', () => {
	const USER_ID = 10;
	const USER_EMAIL = 'user@example.com';
	const VIEWER_ID = 20;
	const NON_MEMBER_ID = 99;
	const WORKSPACE_ID = 'ws-report-123';
	const OTHER_WORKSPACE_ID = 'ws-other-456';

	const ACCOUNT_1_ID = 'acc-nubank-1';
	const ACCOUNT_2_ID = 'acc-inter-2';
	const FOREIGN_ACCOUNT_ID = 'acc-foreign-9';

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
			id: ACCOUNT_1_ID,
			workspace_id: WORKSPACE_ID,
			name: 'Nubank Principal',
			bank_name: 'Nubank',
			account_type: 'checking',
			initial_balance: 1000,
			color: '#820ad1',
			status: 'active',
		},
		{
			id: ACCOUNT_2_ID,
			workspace_id: WORKSPACE_ID,
			name: 'Inter Investimentos',
			bank_name: 'Inter',
			account_type: 'investment',
			initial_balance: 5000,
			color: '#ff7a00',
			status: 'active',
		},
		{
			id: FOREIGN_ACCOUNT_ID,
			workspace_id: OTHER_WORKSPACE_ID,
			name: 'Conta Externa',
			bank_name: 'Caixa',
			account_type: 'checking',
			initial_balance: 200,
			color: '#005ca9',
			status: 'active',
		},
	];

	const categories = [
		{ id: 1, workspace_id: WORKSPACE_ID, name: 'Alimentação', color: '#ef4444', icon: 'Utensils' },
		{ id: 2, workspace_id: WORKSPACE_ID, name: 'Salário', color: '#22c55e', icon: 'Briefcase' },
		{ id: 3, workspace_id: WORKSPACE_ID, name: 'Transporte', color: '#3b82f6', icon: 'Car' },
		{ id: 99, workspace_id: OTHER_WORKSPACE_ID, name: 'Outro Workspace', color: '#000000', icon: 'Tag' },
	];

	const transactions = [
		{
			id: 101,
			workspace_id: WORKSPACE_ID,
			user_id: USER_ID,
			category_id: 2,
			account_id: ACCOUNT_1_ID,
			type: 'income',
			description: 'Salário Mensal',
			amount: 6000,
			date: '2026-09-05',
		},
		{
			id: 102,
			workspace_id: WORKSPACE_ID,
			user_id: USER_ID,
			category_id: 1,
			account_id: ACCOUNT_1_ID,
			type: 'expense',
			description: 'Supermercado Central',
			amount: 1500,
			date: '2026-09-10',
		},
		{
			id: 103,
			workspace_id: WORKSPACE_ID,
			user_id: USER_ID,
			category_id: 3,
			account_id: ACCOUNT_2_ID,
			type: 'expense',
			description: 'Combustível Posto Shell',
			amount: 500,
			date: '2026-09-15',
		},
		{
			id: 104,
			workspace_id: WORKSPACE_ID,
			user_id: USER_ID,
			category_id: 1,
			account_id: ACCOUNT_1_ID,
			type: 'expense',
			description: 'Restaurante Almoço',
			amount: 200,
			date: '2026-08-20', // Mês anterior
		},
	];

	beforeEach(async () => {
		token = await generateToken({ userId: USER_ID, email: USER_EMAIL, isAdmin: false }, 'test-secret-key-for-unit-tests-1234567890');
		viewerToken = await generateToken({ userId: VIEWER_ID, email: 'viewer@example.com', isAdmin: false }, 'test-secret-key-for-unit-tests-1234567890');
		nonMemberToken = await generateToken({ userId: NON_MEMBER_ID, email: 'stranger@example.com', isAdmin: false }, 'test-secret-key-for-unit-tests-1234567890');
	});

	it('1. deve retornar o resumo analítico completo com totais, categorias e contas', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(`/workspaces/${WORKSPACE_ID}/reports/summary`, {
			headers: { Authorization: `Bearer ${token}` },
		}, env);

		expect(res.status).toBe(200);
		const data = await res.json();

		expect(data.totals.income).toBe(6000);
		expect(data.totals.expense).toBe(2200); // 1500 + 500 + 200
		expect(data.totals.balance).toBe(3800); // 6000 - 2200
		expect(data.totals.count).toBe(4);
		expect(data.by_category.length).toBeGreaterThan(0);
		expect(data.by_account.length).toBeGreaterThan(0);
		expect(data.transactions.length).toBe(4);
	});

	it('2. deve filtrar transações por período (start e end)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/reports/summary?start=2026-09-01&end=2026-09-30`,
			{ headers: { Authorization: `Bearer ${token}` } },
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json();

		expect(data.period.start).toBe('2026-09-01');
		expect(data.period.end).toBe('2026-09-30');
		expect(data.totals.income).toBe(6000);
		expect(data.totals.expense).toBe(2000); // 1500 + 500 (ignora agosto)
		expect(data.totals.balance).toBe(4000);
		expect(data.totals.count).toBe(3);
		expect(data.transactions.length).toBe(3);
	});

	it('3. deve filtrar transações por conta bancária específica', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/reports/summary?account_id=${ACCOUNT_2_ID}`,
			{ headers: { Authorization: `Bearer ${token}` } },
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json();

		expect(data.filters.account_id).toBe(ACCOUNT_2_ID);
		expect(data.totals.income).toBe(0);
		expect(data.totals.expense).toBe(500);
		expect(data.totals.balance).toBe(-500);
		expect(data.totals.count).toBe(1);
		expect(data.transactions[0].description).toBe('Combustível Posto Shell');
	});

	it('4. deve filtrar transações por categoria específica', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/reports/summary?category_id=1`,
			{ headers: { Authorization: `Bearer ${token}` } },
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json();

		expect(data.filters.category_id).toBe(1);
		expect(data.totals.income).toBe(0);
		expect(data.totals.expense).toBe(1700); // 1500 + 200
		expect(data.totals.count).toBe(2);
		expect(data.transactions.every((t: any) => t.category_id === 1)).toBe(true);
	});

	it('5. deve filtrar transações por tipo (somente income ou somente expense)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/reports/summary?type=income`,
			{ headers: { Authorization: `Bearer ${token}` } },
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json();

		expect(data.totals.income).toBe(6000);
		expect(data.totals.expense).toBe(0);
		expect(data.totals.count).toBe(1);
	});

	it('6. deve permitir que usuário com perfil viewer visualize os relatórios', async () => {
		const env = createEnvMock({
			workspace_members: [viewerMemberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(`/workspaces/${WORKSPACE_ID}/reports/summary`, {
			headers: { Authorization: `Bearer ${viewerToken}` },
		}, env);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.totals).toBeDefined();
	});

	it('7. deve rejeitar conta bancária inexistente ou de outro workspace com 400', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/reports/summary?account_id=${FOREIGN_ACCOUNT_ID}`,
			{ headers: { Authorization: `Bearer ${token}` } },
			env
		);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain('Conta bancária não encontrada ou não pertence a este workspace');
	});

	it('8. deve rejeitar categoria inexistente ou de outro workspace com 400', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/reports/summary?category_id=99`,
			{ headers: { Authorization: `Bearer ${token}` } },
			env
		);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain('Categoria não encontrada ou não pertence a este workspace');
	});

	it('9. deve rejeitar usuário que não é membro do workspace com 403', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: transactions,
		});

		const res = await app.request(`/workspaces/${WORKSPACE_ID}/reports/summary`, {
			headers: { Authorization: `Bearer ${nonMemberToken}` },
		}, env);

		expect(res.status).toBe(403);
		const data = await res.json();
		expect(data.error).toContain('Acesso negado');
	});
});
