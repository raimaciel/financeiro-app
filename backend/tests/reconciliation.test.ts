import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

describe('Reconciliation Router (Fase 8)', () => {
	const USER_ID = 10;
	const USER_EMAIL = 'user@example.com';
	const VIEWER_ID = 20;
	const WORKSPACE_ID = 'ws-rec-123';
	const OTHER_WORKSPACE_ID = 'ws-other-456';
	const ACCOUNT_ID = 'acc-rec-1';
	const FOREIGN_ACCOUNT_ID = 'acc-foreign-9';

	let token: string;
	let viewerToken: string;

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
			id: ACCOUNT_ID,
			workspace_id: WORKSPACE_ID,
			name: 'Conta Corrente Conciliação',
			bank_name: 'Banco Inter',
			account_type: 'checking',
			initial_balance: 5000,
			color: '#ff7a00',
			status: 'active',
		},
		{
			id: FOREIGN_ACCOUNT_ID,
			workspace_id: OTHER_WORKSPACE_ID,
			name: 'Conta Externa',
			bank_name: 'Nubank',
			account_type: 'checking',
			initial_balance: 1000,
			color: '#820ad1',
			status: 'active',
		},
	];

	const categories = [
		{ id: 1, workspace_id: WORKSPACE_ID, name: 'Alimentação', color: '#ef4444', icon: 'Utensils' },
		{ id: 2, workspace_id: WORKSPACE_ID, name: 'Assinaturas', color: '#3b82f6', icon: 'Tv' },
	];

	const existingTransactions = [
		{
			id: 1001,
			workspace_id: WORKSPACE_ID,
			user_id: USER_ID,
			category_id: 1,
			account_id: ACCOUNT_ID,
			type: 'expense',
			description: 'Supermercado Mensal',
			amount: 150,
			date: '2026-09-10',
			reconciled: 0,
			external_id: null,
		},
		{
			id: 1002,
			workspace_id: WORKSPACE_ID,
			user_id: USER_ID,
			category_id: 2,
			account_id: ACCOUNT_ID,
			type: 'expense',
			description: 'Netflix Streaming',
			amount: 55.90,
			date: '2026-09-08', // 2 dias de diferença para 2026-09-10
			reconciled: 0,
			external_id: null,
		},
	];

	beforeEach(async () => {
		token = await generateToken({ userId: USER_ID, email: USER_EMAIL, isAdmin: false }, 'test-secret-key-for-unit-tests-1234567890');
		viewerToken = await generateToken({ userId: VIEWER_ID, email: 'viewer@example.com', isAdmin: false }, 'test-secret-key-for-unit-tests-1234567890');
	});

	it('1. deve identificar match exato, match aproximado (+/- 3 dias) e item sem match', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: [...existingTransactions],
		});

		const itemsToMatch = [
			{
				id: 'ext-1',
				date: '2026-09-10',
				amount: 150,
				type: 'expense',
				description: 'Supermercado Mensal Cartão',
				fitid: 'fitid-001',
			},
			{
				id: 'ext-2',
				date: '2026-09-10',
				amount: 55.90,
				type: 'expense',
				description: 'Netflix Mensalidade', // 2 dias de diferença com id 1002 (2026-09-08)
				fitid: 'fitid-002',
			},
			{
				id: 'ext-3',
				date: '2026-09-12',
				amount: 300,
				type: 'expense',
				description: 'Restaurante Novo',
				fitid: 'fitid-003',
			},
		];

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/reconciliation/match`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ items: itemsToMatch }),
			},
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json();

		expect(data.total_items).toBe(3);
		expect(data.matched_exact_count).toBe(1);
		expect(data.matched_approximate_count).toBe(1);
		expect(data.unmatched_count).toBe(1);

		// Match exato
		const exact = data.items.find((i: any) => i.id === 'ext-1');
		expect(exact.status).toBe('matched_exact');
		expect(exact.confidence).toBe('high');
		expect(exact.suggested_action).toBe('ignore');
		expect(exact.matched_transaction.id).toBe(1001);

		// Match aproximado
		const approx = data.items.find((i: any) => i.id === 'ext-2');
		expect(approx.status).toBe('matched_approximate');
		expect(approx.confidence).toBe('medium');
		expect(approx.suggested_action).toBe('link_existing');
		expect(approx.matched_transaction.id).toBe(1002);
		expect(approx.difference_days).toBe(2);

		// Sem match
		const unmatched = data.items.find((i: any) => i.id === 'ext-3');
		expect(unmatched.status).toBe('unmatched');
		expect(unmatched.confidence).toBe('none');
		expect(unmatched.suggested_action).toBe('create_new');
		expect(unmatched.matched_transaction).toBeNull();
	});

	it('2. deve processar e confirmar decisões: link_existing, create_new e ignore', async () => {
		const txRows = JSON.parse(JSON.stringify(existingTransactions));
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: txRows,
		});

		const decisions = [
			{
				action: 'ignore',
				statement_item: {
					id: 'ext-1',
					date: '2026-09-10',
					amount: 150,
					type: 'expense',
					description: 'Supermercado Mensal Cartão',
				},
			},
			{
				action: 'link_existing',
				transaction_id: 1002,
				statement_item: {
					id: 'ext-2',
					date: '2026-09-10',
					amount: 55.90,
					type: 'expense',
					description: 'Netflix Mensalidade',
					fitid: 'fitid-002',
				},
			},
			{
				action: 'create_new',
				statement_item: {
					id: 'ext-3',
					date: '2026-09-12',
					amount: 300,
					type: 'expense',
					description: 'Restaurante Novo',
					category_id: 1,
					fitid: 'fitid-003',
				},
			},
		];

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/reconciliation/confirm`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ decisions }),
			},
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json();

		expect(data.success).toBe(true);
		expect(data.ignored_count).toBe(1);
		expect(data.linked_count).toBe(1);
		expect(data.created_count).toBe(1);
		expect(data.total_processed).toBe(3);

		// Verifica que a transação vinculada foi marcada como reconciliada
		const updatedTx = txRows.find((t: any) => t.id === 1002);
		expect(updatedTx.reconciled).toBe(1);
		expect(updatedTx.external_id).toBe('fitid-002');

		// Verifica que uma nova transação foi criada
		const createdTx = txRows.find((t: any) => t.description === 'Restaurante Novo');
		expect(createdTx).toBeDefined();
		expect(createdTx.reconciled).toBe(1);
		expect(createdTx.external_id).toBe('fitid-003');
		expect(createdTx.account_id).toBe(ACCOUNT_ID);
	});

	it('3. deve rejeitar conta bancária de outro workspace com 404', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: existingTransactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/accounts/${FOREIGN_ACCOUNT_ID}/reconciliation/match`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ items: [] }),
			},
			env
		);

		expect(res.status).toBe(404);
		const data = await res.json();
		expect(data.error).toContain('Conta bancária não encontrada ou não pertence a este workspace');
	});

	it('4. deve rejeitar acesso para usuário com perfil viewer com 403', async () => {
		const env = createEnvMock({
			workspace_members: [viewerMemberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: existingTransactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/reconciliation/match`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${viewerToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ items: [] }),
			},
			env
		);

		expect(res.status).toBe(403);
		const data = await res.json();
		expect(data.error).toContain('Acesso negado ou permissão insuficiente');
	});

	it('5. deve rejeitar confirmação sem decisões com 400', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: bankAccounts,
			categories: categories,
			transactions: existingTransactions,
		});

		const res = await app.request(
			`/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/reconciliation/confirm`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ decisions: [] }),
			},
			env
		);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain('Nenhuma decisão de conciliação enviada');
	});
});
