import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-test-123';
const OTHER_WORKSPACE_ID = 'ws-other-456';

async function token(userId = 1) {
	return generateToken({ userId, email: `user${userId}@test.com` }, JWT_SECRET);
}

const memberRow = { role: 'owner', user_id: '1', workspace_id: WORKSPACE_ID };

describe('Rotas e Alertas de Notificações - Fase 9', () => {
	it('1. deve retornar 401 sem autenticação e 403 se usuário não for membro do workspace', async () => {
		const env = createEnvMock({ workspace_members: [] });
		const reqUnauth = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`);
		const resUnauth = await app.fetch(reqUnauth, env);
		expect(resUnauth.status).toBe(401);

		const tk = await token();
		const reqForbidden = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const resForbidden = await app.fetch(reqForbidden, env);
		expect(resForbidden.status).toBe(403);
	});

	it('2. deve gerar notificação persistida de fatura próxima do vencimento (<= 3 dias)', async () => {
		const today = new Date();
		const inTwoDays = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [
				{ id: 'card-1', workspace_id: WORKSPACE_ID, name: 'Cartão Platinum' },
			],
			invoices: [
				{
					id: 'inv-due-soon',
					workspace_id: WORKSPACE_ID,
					credit_card_id: 'card-1',
					due_date: inTwoDays,
					total_amount: 350.5,
					status: 'open',
				},
			],
		});

		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.unread_count).toBeGreaterThan(0);
		const dueNotif = body.notifications.find((n: any) => n.type === 'invoice_due');
		expect(dueNotif).toBeDefined();
		expect(dueNotif.title).toContain('Fatura próxima do vencimento');
		expect(dueNotif.message).toContain('350.50');
		expect(dueNotif.related_entity_type).toBe('invoice');
		expect(dueNotif.related_entity_id).toBe('inv-due-soon');
		expect(dueNotif.related_link).toBe('/credit-cards');
	});

	it('3. deve gerar notificação persistida de fatura vencida (status != paid e due_date no passado)', async () => {
		const pastDate = '2026-01-15';

		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [
				{ id: 'card-2', workspace_id: WORKSPACE_ID, name: 'Cartão Black' },
			],
			invoices: [
				{
					id: 'inv-overdue',
					workspace_id: WORKSPACE_ID,
					credit_card_id: 'card-2',
					due_date: pastDate,
					total_amount: 1200.0,
					status: 'open',
				},
			],
		});

		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		const overdueNotif = body.notifications.find((n: any) => n.type === 'invoice_overdue');
		expect(overdueNotif).toBeDefined();
		expect(overdueNotif.title).toContain('Fatura vencida');
		expect(overdueNotif.severity).toBe('danger');
		expect(overdueNotif.related_entity_id).toBe('inv-overdue');
	});

	it('4. deve gerar notificação de saldo baixo para conta com saldo < R$ 100', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [
				{
					id: 'acc-low',
					workspace_id: WORKSPACE_ID,
					name: 'Conta Corrente Inter',
					initial_balance: 50.0,
					status: 'active',
				},
			],
			transactions: [],
			account_transfers: [],
			invoices: [],
		});

		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		const lowNotif = body.notifications.find((n: any) => n.type === 'low_balance');
		expect(lowNotif).toBeDefined();
		expect(lowNotif.title).toContain('Saldo baixo');
		expect(lowNotif.related_entity_type).toBe('account');
		expect(lowNotif.related_entity_id).toBe('acc-low');
		expect(lowNotif.related_link).toBe('/accounts');
	});

	it('5. não deve duplicar alertas de mesma entidade/tipo criados nas últimas 24h', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [
				{
					id: 'acc-duplicate-check',
					workspace_id: WORKSPACE_ID,
					name: 'Conta Poupança',
					initial_balance: 20.0,
					status: 'active',
				},
			],
			// Notificação já existente criada há 1 hora
			notifications: [
				{
					id: 'notif-existing-1',
					workspace_id: WORKSPACE_ID,
					user_id: '1',
					type: 'low_balance',
					title: 'Saldo baixo: Conta Poupança',
					message: 'A conta Poupança está com saldo baixo.',
					related_entity_type: 'account',
					related_entity_id: 'acc-duplicate-check',
					is_read: 0,
					created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
				},
			],
		});

		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		// Deve conter apenas 1 notificação, sem duplicar
		const lowNotifs = body.notifications.filter((n: any) => n.related_entity_id === 'acc-duplicate-check');
		expect(lowNotifs).toHaveLength(1);
	});

	it('6. deve marcar notificação individual como lida via PATCH /read e atualizar unread_count', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			notifications: [
				{
					id: 'notif-read-target',
					workspace_id: WORKSPACE_ID,
					user_id: '1',
					type: 'low_balance',
					title: 'Saldo baixo',
					message: 'Alerta de saldo baixo',
					is_read: 0,
					created_at: new Date().toISOString(),
				},
			],
		});

		const tk = await token();

		// Marcar como lida
		const patchReq = new Request(
			`http://localhost/workspaces/${WORKSPACE_ID}/notifications/notif-read-target/read`,
			{
				method: 'PATCH',
				headers: { Authorization: `Bearer ${tk}` },
			}
		);
		const patchRes = await app.fetch(patchReq, env);
		expect(patchRes.status).toBe(200);

		// Listar filtrando apenas não lidas
		const listReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications?unread=true`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const listRes = await app.fetch(listReq, env);
		const listBody = (await listRes.json()) as any;
		expect(listBody.unread_count).toBe(0);
		expect(listBody.notifications).toHaveLength(0);
	});

	it('7. deve marcar todas como lidas em lote (read-all) e permitir excluir notificação (DELETE)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			notifications: [
				{
					id: 'notif-bulk-1',
					workspace_id: WORKSPACE_ID,
					user_id: '1',
					type: 'info',
					title: 'Aviso 1',
					message: 'Mensagem 1',
					is_read: 0,
					created_at: new Date().toISOString(),
				},
				{
					id: 'notif-bulk-2',
					workspace_id: WORKSPACE_ID,
					user_id: '1',
					type: 'info',
					title: 'Aviso 2',
					message: 'Mensagem 2',
					is_read: 0,
					created_at: new Date().toISOString(),
				},
			],
		});

		const tk = await token();

		// Marcar todas como lidas
		const readAllReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications/read-all`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${tk}` },
		});
		const readAllRes = await app.fetch(readAllReq, env);
		expect(readAllRes.status).toBe(200);

		// Excluir notif-bulk-1
		const delReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications/notif-bulk-1`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tk}` },
		});
		const delRes = await app.fetch(delReq, env);
		expect(delRes.status).toBe(200);

		// Listar todas as notificações
		const listReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tk}` },
		});
		const listRes = await app.fetch(listReq, env);
		const listBody = (await listRes.json()) as any;
		expect(listBody.unread_count).toBe(0);
		expect(listBody.notifications).toHaveLength(1);
		expect(listBody.notifications[0].id).toBe('notif-bulk-2');
	});

	it('8. deve barrar acesso / exclusão de notificações de outro workspace ou usuário', async () => {
		const env = createEnvMock({
			workspace_members: [
				{ role: 'owner', user_id: '1', workspace_id: WORKSPACE_ID },
				{ role: 'owner', user_id: '2', workspace_id: OTHER_WORKSPACE_ID },
			],
			notifications: [
				{
					id: 'notif-other-ws',
					workspace_id: OTHER_WORKSPACE_ID,
					user_id: '2',
					type: 'info',
					title: 'Outro workspace',
					message: 'Privado',
					is_read: 0,
					created_at: new Date().toISOString(),
				},
			],
		});

		const tkUser1 = await token(1);

		// Tentar ler notificações do outro workspace
		const getReq = new Request(`http://localhost/workspaces/${OTHER_WORKSPACE_ID}/notifications`, {
			headers: { Authorization: `Bearer ${tkUser1}` },
		});
		const getRes = await app.fetch(getReq, env);
		expect(getRes.status).toBe(403);

		// Tentar deletar notificação do outro workspace via URL de workspace não pertencente
		const delReq = new Request(`http://localhost/workspaces/${OTHER_WORKSPACE_ID}/notifications/notif-other-ws`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${tkUser1}` },
		});
		const delRes = await app.fetch(delReq, env);
		expect(delRes.status).toBe(403);
	});
});
