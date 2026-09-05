import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const accountsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de contas com authMiddleware
accountsRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

const VALID_ACCOUNT_TYPES = ['checking', 'savings', 'investment', 'cash'] as const;
const VALID_STATUSES = ['active', 'archived'] as const;

// 1. GET /workspaces/:workspaceId/accounts - Listar contas do workspace
accountsRouter.get('/workspaces/:workspaceId/accounts', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const statusFilter = c.req.query('status');
		const typeFilter = c.req.query('type');

		let query = 'SELECT id, workspace_id, name, bank_name, account_type, initial_balance, color, status, created_at, updated_at FROM bank_accounts WHERE workspace_id = ?';
		const bindings: any[] = [workspaceId];

		if (statusFilter && VALID_STATUSES.includes(statusFilter as any)) {
			query += ' AND status = ?';
			bindings.push(statusFilter);
		}

		if (typeFilter && VALID_ACCOUNT_TYPES.includes(typeFilter as any)) {
			query += ' AND account_type = ?';
			bindings.push(typeFilter);
		}

		query += ' ORDER BY name ASC';

		const { results } = await db
			.prepare(query)
			.bind(...bindings)
			.all();

		return c.json(results || []);
	} catch (err) {
		console.error('Erro ao listar contas bancárias:', err);
		return c.json({ error: 'Erro ao listar contas bancárias' }, 500);
	}
});

// 2. GET /workspaces/:workspaceId/accounts/:id - Obter conta por ID
accountsRouter.get('/workspaces/:workspaceId/accounts/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const accountId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const account = await db
			.prepare('SELECT id, workspace_id, name, bank_name, account_type, initial_balance, color, status, created_at, updated_at FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(accountId, workspaceId)
			.first();

		if (!account) {
			return c.json({ error: 'Conta bancária não encontrada' }, 404);
		}

		return c.json(account);
	} catch (err) {
		console.error('Erro ao buscar conta bancária:', err);
		return c.json({ error: 'Erro ao buscar conta bancária' }, 500);
	}
});

// 3. POST /workspaces/:workspaceId/accounts - Criar conta bancária
accountsRouter.post('/workspaces/:workspaceId/accounts', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem criar contas' }, 403);
		}

		const body = await c.req.json();
		const { name, bank_name, account_type, initial_balance, color } = body;

		if (!name || typeof name !== 'string' || name.trim() === '') {
			return c.json({ error: 'Nome da conta é obrigatório' }, 400);
		}

		const cleanType = account_type ? String(account_type).trim().toLowerCase() : 'checking';
		if (!VALID_ACCOUNT_TYPES.includes(cleanType as any)) {
			return c.json({ error: `Tipo de conta inválido. Deve ser um dos seguintes: ${VALID_ACCOUNT_TYPES.join(', ')}` }, 400);
		}

		const balanceNum = initial_balance !== undefined && initial_balance !== null ? Number(initial_balance) : 0;
		if (isNaN(balanceNum)) {
			return c.json({ error: 'Saldo inicial deve ser um número válido' }, 400);
		}

		const id = crypto.randomUUID();
		const cleanName = name.trim();
		const cleanBankName = bank_name && typeof bank_name === 'string' ? bank_name.trim() : null;
		const cleanColor = color && typeof color === 'string' ? color.trim() : '#2563eb';
		const status = 'active';

		await db
			.prepare(`
				INSERT INTO bank_accounts (id, workspace_id, name, bank_name, account_type, initial_balance, color, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.bind(id, workspaceId, cleanName, cleanBankName, cleanType, balanceNum, cleanColor, status)
			.run();

		return c.json({
			id,
			workspace_id: workspaceId,
			name: cleanName,
			bank_name: cleanBankName,
			account_type: cleanType,
			initial_balance: balanceNum,
			color: cleanColor,
			status,
		}, 201);
	} catch (err) {
		console.error('Erro ao criar conta bancária:', err);
		return c.json({ error: 'Erro ao criar conta bancária' }, 500);
	}
});

// 4. PUT /workspaces/:workspaceId/accounts/:id - Editar conta bancária
accountsRouter.put('/workspaces/:workspaceId/accounts/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const accountId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem editar contas' }, 403);
		}

		const existing = await db
			.prepare('SELECT * FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(accountId, workspaceId)
			.first<any>();

		if (!existing) {
			return c.json({ error: 'Conta bancária não encontrada' }, 404);
		}

		const body = await c.req.json();
		const name = body.name !== undefined ? String(body.name).trim() : existing.name;
		if (!name) {
			return c.json({ error: 'Nome da conta não pode ser vazio' }, 400);
		}

		let cleanType = existing.account_type;
		if (body.account_type !== undefined) {
			cleanType = String(body.account_type).trim().toLowerCase();
			if (!VALID_ACCOUNT_TYPES.includes(cleanType as any)) {
				return c.json({ error: `Tipo de conta inválido. Deve ser um dos seguintes: ${VALID_ACCOUNT_TYPES.join(', ')}` }, 400);
			}
		}

		let balanceNum = existing.initial_balance;
		if (body.initial_balance !== undefined) {
			balanceNum = Number(body.initial_balance);
			if (isNaN(balanceNum)) {
				return c.json({ error: 'Saldo inicial deve ser um número válido' }, 400);
			}
		}

		let cleanStatus = existing.status;
		if (body.status !== undefined) {
			cleanStatus = String(body.status).trim().toLowerCase();
			if (!VALID_STATUSES.includes(cleanStatus as any)) {
				return c.json({ error: `Status inválido. Deve ser 'active' ou 'archived'` }, 400);
			}
		}

		const bankName = body.bank_name !== undefined ? (body.bank_name ? String(body.bank_name).trim() : null) : existing.bank_name;
		const color = body.color !== undefined ? (body.color ? String(body.color).trim() : '#2563eb') : existing.color;

		await db
			.prepare(`
				UPDATE bank_accounts
				SET name = ?, bank_name = ?, account_type = ?, initial_balance = ?, color = ?, status = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ? AND workspace_id = ?
			`)
			.bind(name, bankName, cleanType, balanceNum, color, cleanStatus, accountId, workspaceId)
			.run();

		return c.json({
			id: accountId,
			workspace_id: workspaceId,
			name,
			bank_name: bankName,
			account_type: cleanType,
			initial_balance: balanceNum,
			color,
			status: cleanStatus,
		}, 200);
	} catch (err) {
		console.error('Erro ao atualizar conta bancária:', err);
		return c.json({ error: 'Erro ao atualizar conta bancária' }, 500);
	}
});

// 5. DELETE /workspaces/:workspaceId/accounts/:id - Excluir conta bancária
accountsRouter.delete('/workspaces/:workspaceId/accounts/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const accountId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem excluir contas' }, 403);
		}

		const existing = await db
			.prepare('SELECT id FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(accountId, workspaceId)
			.first();

		if (!existing) {
			return c.json({ error: 'Conta bancária não encontrada' }, 404);
		}

		await db
			.prepare('DELETE FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(accountId, workspaceId)
			.run();

		return c.json({ message: 'Conta bancária removida com sucesso' }, 200);
	} catch (err) {
		console.error('Erro ao deletar conta bancária:', err);
		return c.json({ error: 'Erro ao deletar conta bancária' }, 500);
	}
});

export default accountsRouter;
