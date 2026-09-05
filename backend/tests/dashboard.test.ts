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

	it('deve retornar accounts_balance e total_accounts_balance calculados corretamente', async () => {
		const mockAccounts = [
			{
				id: 'acc-1',
				workspace_id: WORKSPACE_ID,
				name: 'Conta Inter',
				bank_name: 'Banco Inter',
				color: '#FF7A00',
				account_type: 'checking',
				initial_balance: 1000,
				status: 'active',
			},
			{
				id: 'acc-2',
				workspace_id: WORKSPACE_ID,
				name: 'Poupança Caixa',
				bank_name: 'Caixa',
				color: '#005CA9',
				account_type: 'savings',
				initial_balance: 2500,
				status: 'active',
			},
			{
				id: 'acc-archived',
				workspace_id: WORKSPACE_ID,
				name: 'Conta Antiga',
				bank_name: 'Banco Antigo',
				color: '#999999',
				account_type: 'checking',
				initial_balance: 500,
				status: 'archived',
			},
		];

		const mockTransactions = [
			{
				id: 1,
				workspace_id: WORKSPACE_ID,
				account_id: 'acc-1',
				type: 'income',
				amount: 500,
			},
			{
				id: 2,
				workspace_id: WORKSPACE_ID,
				account_id: 'acc-1',
				type: 'expense',
				amount: 200,
			},
			{
				id: 3,
				workspace_id: WORKSPACE_ID,
				account_id: 'acc-archived',
				type: 'income',
				amount: 1000,
			},
		];

		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
			bank_accounts: mockAccounts,
			transactions: mockTransactions,
		});

		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard`, tk),
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data).toHaveProperty('accounts_balance');
		expect(data).toHaveProperty('total_accounts_balance');
		expect(Array.isArray(data.accounts_balance)).toBe(true);

		// Contas arquivadas não devem constar
		expect(data.accounts_balance).toHaveLength(2);
		const ids = data.accounts_balance.map((a: any) => a.id);
		expect(ids).toContain('acc-1');
		expect(ids).toContain('acc-2');
		expect(ids).not.toContain('acc-archived');

		// Conta com receitas e despesas vinculadas (1000 + 500 - 200 = 1300)
		const acc1 = data.accounts_balance.find((a: any) => a.id === 'acc-1');
		expect(acc1.initial_balance).toBe(1000);
		expect(acc1.current_balance).toBe(1300);

		// Conta sem transações vinculadas (initial_balance = current_balance = 2500)
		const acc2 = data.accounts_balance.find((a: any) => a.id === 'acc-2');
		expect(acc2.initial_balance).toBe(2500);
		expect(acc2.current_balance).toBe(2500);

		// Total consolidado: 1300 + 2500 = 3800
		expect(data.total_accounts_balance).toBe(3800);
	});

	it('deve refletir transferências entre contas no saldo de cada conta e no saldo total', async () => {
		const mockAccounts = [
			{
				id: 'acc-origem',
				workspace_id: WORKSPACE_ID,
				name: 'Conta Inter',
				bank_name: 'Banco Inter',
				color: '#FF7A00',
				account_type: 'checking',
				initial_balance: 5000,
				status: 'active',
			},
			{
				id: 'acc-destino',
				workspace_id: WORKSPACE_ID,
				name: 'Poupança Nubank',
				bank_name: 'Nubank',
				color: '#820AD1',
				account_type: 'savings',
				initial_balance: 1000,
				status: 'active',
			},
		];

		const mockTransfers = [
			{
				id: 'tr-1',
				workspace_id: WORKSPACE_ID,
				from_account_id: 'acc-origem',
				to_account_id: 'acc-destino',
				amount: 1500,
				date: '2026-09-05',
			},
		];

		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
			bank_accounts: mockAccounts,
			account_transfers: mockTransfers,
			transactions: [],
		});

		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard`, tk),
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json() as any;

		// Origem: 5000 - 1500 = 3500
		const accOrigem = data.accounts_balance.find((a: any) => a.id === 'acc-origem');
		expect(accOrigem.current_balance).toBe(3500);

		// Destino: 1000 + 1500 = 2500
		const accDestino = data.accounts_balance.find((a: any) => a.id === 'acc-destino');
		expect(accDestino.current_balance).toBe(2500);

		// Total consolidado: 3500 + 2500 = 6000 (igual ao saldo inicial somado 5000 + 1000)
		expect(data.total_accounts_balance).toBe(6000);
	});

	it('deve deduzir pagamentos de faturas vinculados a contas no saldo atual', async () => {
		const mockAccounts = [
			{
				id: 'acc-pagadora',
				workspace_id: WORKSPACE_ID,
				name: 'Conta Corrente',
				bank_name: 'Itaú',
				color: '#EC7000',
				account_type: 'checking',
				initial_balance: 4000,
				status: 'active',
			},
		];

		const mockInvoices = [
			{
				id: 'inv-paga-dashboard',
				workspace_id: WORKSPACE_ID,
				credit_card_id: 'card-1',
				reference_month: '2026-08',
				status: 'paid',
				total_amount: 850.5,
				payment_account_id: 'acc-pagadora',
			},
			{
				id: 'inv-aberta-dashboard',
				workspace_id: WORKSPACE_ID,
				credit_card_id: 'card-1',
				reference_month: '2026-09',
				status: 'open',
				total_amount: 500,
				payment_account_id: 'acc-pagadora',
			},
		];

		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
			bank_accounts: mockAccounts,
			account_transfers: [],
			invoices: mockInvoices,
			transactions: [],
		});

		const tk = await token();
		const res = await app.fetch(
			request(`/workspaces/${WORKSPACE_ID}/dashboard`, tk),
			env
		);

		expect(res.status).toBe(200);
		const data = await res.json() as any;

		// 4000 - 850.50 = 3149.50 (ignora a fatura aberta)
		const acc = data.accounts_balance.find((a: any) => a.id === 'acc-pagadora');
		expect(acc.current_balance).toBe(3149.5);
		expect(data.total_accounts_balance).toBe(3149.5);
	});
});


