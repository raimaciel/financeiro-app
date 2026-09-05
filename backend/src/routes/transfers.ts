import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const transfersRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de transferências com authMiddleware
transfersRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// 1. GET /workspaces/:workspaceId/transfers - Listar transferências do workspace
transfersRouter.get('/workspaces/:workspaceId/transfers', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const accountIdFilter = c.req.query('account_id') || c.req.query('accountId');
		const monthFilter = c.req.query('month');

		let query = `
			SELECT 
				t.id,
				t.workspace_id,
				t.from_account_id,
				t.to_account_id,
				t.amount,
				t.description,
				t.date,
				t.created_at,
				t.updated_at,
				from_ba.name as from_account_name,
				from_ba.bank_name as from_account_bank_name,
				from_ba.color as from_account_color,
				to_ba.name as to_account_name,
				to_ba.bank_name as to_account_bank_name,
				to_ba.color as to_account_color
			FROM account_transfers t
			LEFT JOIN bank_accounts from_ba ON from_ba.id = t.from_account_id
			LEFT JOIN bank_accounts to_ba ON to_ba.id = t.to_account_id
			WHERE t.workspace_id = ?
		`;
		const bindings: any[] = [workspaceId];

		if (accountIdFilter && accountIdFilter !== 'all') {
			query += ' AND (t.from_account_id = ? OR t.to_account_id = ?)';
			bindings.push(accountIdFilter, accountIdFilter);
		}

		if (monthFilter) {
			query += ' AND t.date LIKE ?';
			bindings.push(`${monthFilter}-%`);
		}

		query += ' ORDER BY t.date DESC, t.created_at DESC';

		const { results } = await db
			.prepare(query)
			.bind(...bindings)
			.all();

		return c.json(results || []);
	} catch (err) {
		console.error('Erro ao listar transferências:', err);
		return c.json({ error: 'Erro ao listar transferências' }, 500);
	}
});

// 2. POST /workspaces/:workspaceId/transfers - Criar nova transferência
transfersRouter.post('/workspaces/:workspaceId/transfers', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão negada. Usuários com papel "viewer" não podem realizar transferências' }, 403);
		}

		const body = await c.req.json();
		const { from_account_id, to_account_id, amount, description, date } = body;

		if (!from_account_id || typeof from_account_id !== 'string') {
			return c.json({ error: 'A conta de origem é obrigatória' }, 400);
		}

		if (!to_account_id || typeof to_account_id !== 'string') {
			return c.json({ error: 'A conta de destino é obrigatória' }, 400);
		}

		if (from_account_id === to_account_id) {
			return c.json({ error: 'As contas de origem e destino devem ser diferentes' }, 400);
		}

		const parsedAmount = typeof amount === 'number' ? amount : parseFloat(String(amount || '0').replace(',', '.'));
		if (isNaN(parsedAmount) || parsedAmount <= 0) {
			return c.json({ error: 'O valor da transferência deve ser um número positivo maior que zero' }, 400);
		}

		if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return c.json({ error: 'Data inválida. O formato correto é AAAA-MM-DD' }, 400);
		}

		// Validar conta de origem no mesmo workspace
		const fromAccount = await db
			.prepare('SELECT id, name, bank_name, color FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(from_account_id, workspaceId)
			.first<{ id: string; name: string; bank_name: string | null; color: string | null }>();

		if (!fromAccount) {
			return c.json({ error: 'Conta de origem não encontrada neste workspace' }, 400);
		}

		// Validar conta de destino no mesmo workspace
		const toAccount = await db
			.prepare('SELECT id, name, bank_name, color FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(to_account_id, workspaceId)
			.first<{ id: string; name: string; bank_name: string | null; color: string | null }>();

		if (!toAccount) {
			return c.json({ error: 'Conta de destino não encontrada neste workspace' }, 400);
		}

		const transferId = crypto.randomUUID();
		const cleanDescription = description && typeof description === 'string' ? description.trim() : null;

		await db
			.prepare(`
				INSERT INTO account_transfers (
					id, workspace_id, from_account_id, to_account_id, amount, description, date, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
			`)
			.bind(transferId, workspaceId, from_account_id, to_account_id, parsedAmount, cleanDescription, date)
			.run();

		return c.json(
			{
				id: transferId,
				workspace_id: workspaceId,
				from_account_id,
				to_account_id,
				amount: parsedAmount,
				description: cleanDescription,
				date,
				from_account_name: fromAccount.name,
				from_account_bank_name: fromAccount.bank_name,
				from_account_color: fromAccount.color,
				to_account_name: toAccount.name,
				to_account_bank_name: toAccount.bank_name,
				to_account_color: toAccount.color,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			201
		);
	} catch (err) {
		console.error('Erro ao registrar transferência:', err);
		return c.json({ error: 'Erro ao registrar transferência' }, 500);
	}
});

// 3. DELETE /workspaces/:workspaceId/transfers/:id - Excluir transferência
transfersRouter.delete('/workspaces/:workspaceId/transfers/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const transferId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão negada. Usuários com papel "viewer" não podem excluir transferências' }, 403);
		}

		const existing = await db
			.prepare('SELECT id FROM account_transfers WHERE id = ? AND workspace_id = ?')
			.bind(transferId, workspaceId)
			.first();

		if (!existing) {
			return c.json({ error: 'Transferência não encontrada' }, 404);
		}

		await db
			.prepare('DELETE FROM account_transfers WHERE id = ? AND workspace_id = ?')
			.bind(transferId, workspaceId)
			.run();

		return c.json({ message: 'Transferência excluída com sucesso' });
	} catch (err) {
		console.error('Erro ao excluir transferência:', err);
		return c.json({ error: 'Erro ao excluir transferência' }, 500);
	}
});

export default transfersRouter;
