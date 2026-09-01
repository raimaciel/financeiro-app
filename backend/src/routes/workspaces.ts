import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const workspacesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de workspaces com authMiddleware
workspacesRouter.use('*', authMiddleware);

// 1. POST /workspaces - Criar um novo workspace
workspacesRouter.post('/', async (c) => {
	try {
		const { name, type: inputType } = await c.req.json();

		if (!name || typeof name !== 'string' || name.trim() === '') {
			return c.json({ error: 'Nome do workspace é obrigatório' }, 400);
		}

		const type = ['personal', 'couple', 'business'].includes(inputType) ? inputType : 'personal';
		const workspaceId = crypto.randomUUID();
		const memberId = crypto.randomUUID();
		const userId = String(c.get('userId'));

		const db = c.env.financeiro_db || (c.env as any).DB;

		await db
			.prepare('INSERT INTO workspaces (id, name, type) VALUES (?, ?, ?)')
			.bind(workspaceId, name.trim(), type)
			.run();

		await db
			.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)')
			.bind(memberId, workspaceId, userId, 'owner')
			.run();

		return c.json({
			id: workspaceId,
			name: name.trim(),
			type,
			role: 'owner',
		}, 201);
	} catch (err) {
		console.error('Erro ao criar workspace:', err);
		return c.json({ error: 'Erro ao criar workspace' }, 500);
	}
});

// 2. GET /workspaces - Listar workspaces do usuário logado
workspacesRouter.get('/', async (c) => {
	try {
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const { results } = await db
			.prepare(`
				SELECT w.id, w.name, w.type, w.created_at, wm.role
				FROM workspaces w
				INNER JOIN workspace_members wm ON w.id = wm.workspace_id
				WHERE wm.user_id = ?
				ORDER BY w.created_at DESC
			`)
			.bind(userId)
			.all();

		return c.json(results || []);
	} catch (err: any) {
		console.error('[GET /workspaces Error]', err?.message || err, err?.stack);
		return c.json({ error: 'Erro ao listar workspaces' }, 500);
	}
});

// 2.1 GET /workspaces/:id - Obter detalhes de um workspace específico
workspacesRouter.get('/:id', async (c) => {
	const workspaceId = c.req.param('id');
	const userId = String(c.get('userId'));
	try {
		const db = c.env.financeiro_db || (c.env as any).DB;

		if (!db) {
			console.error('[GET /workspaces/:id Error] Binding de banco de dados (financeiro_db / DB) não encontrado no ambiente do Worker.');
			return c.json({ error: 'Erro de configuração no servidor (banco de dados indisponível)' }, 500);
		}

		if (!workspaceId || workspaceId.trim() === '') {
			return c.json({ error: 'ID de workspace inválido' }, 400);
		}

		// 1. Verificar se o usuário é membro deste workspace
		const member = await db
			.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, userId)
			.first<{ role: string }>();

		if (!member) {
			// Verificar se o workspace existe no banco para retornar 404 (inexistente) ou 403 (sem permissão)
			const wsExists = await db
				.prepare('SELECT id FROM workspaces WHERE id = ?')
				.bind(workspaceId)
				.first();

			if (!wsExists) {
				return c.json({ error: 'Workspace não encontrado' }, 404);
			}

			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		// 2. Buscar dados completos do workspace
		const workspace = await db
			.prepare(`
				SELECT id, name, type, created_at
				FROM workspaces
				WHERE id = ?
			`)
			.bind(workspaceId)
			.first<{ id: string; name: string; type: string; created_at: string }>();

		if (!workspace) {
			return c.json({ error: 'Workspace não encontrado' }, 404);
		}

		return c.json({
			...workspace,
			role: member.role,
		}, 200);
	} catch (err: any) {
		console.error('[GET /workspaces/:id Error]', {
			workspaceId,
			userId,
			errorMessage: err?.message || String(err),
			errorName: err?.name,
			stack: err?.stack,
		});
		return c.json({ error: 'Erro interno ao buscar workspace' }, 500);
	}
});

// 3. POST /workspaces/:id/members - Adicionar membro ao workspace
workspacesRouter.post('/:id/members', async (c) => {
	try {
		const workspaceId = c.req.param('id');
		const currentUserId = String(c.get('userId'));
		const { email, role: inputRole } = await c.req.json();

		if (!email || typeof email !== 'string') {
			return c.json({ error: 'Email do usuário é obrigatório' }, 400);
		}

		const role = ['editor', 'viewer'].includes(inputRole) ? inputRole : 'editor';
		const db = c.env.financeiro_db || (c.env as any).DB;

		// Verificar se o usuário logado é owner do workspace
		const currentMember = await db
			.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, currentUserId)
			.first<{ role: string }>();

		if (!currentMember || currentMember.role !== 'owner') {
			return c.json({ error: 'Apenas o proprietário (owner) pode adicionar membros ao workspace' }, 403);
		}

		// Buscar usuário pelo email
		const targetUser = await db
			.prepare('SELECT id FROM users WHERE email = ?')
			.bind(email)
			.first<{ id: number | string }>();

		if (!targetUser) {
			return c.json({ error: 'Usuário não encontrado' }, 404);
		}

		const targetUserId = String(targetUser.id);

		// Verificar se já é membro
		const existingMember = await db
			.prepare('SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, targetUserId)
			.first();

		if (existingMember) {
			return c.json({ error: 'Usuário já é membro deste workspace' }, 409);
		}

		const newMemberId = crypto.randomUUID();

		await db
			.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)')
			.bind(newMemberId, workspaceId, targetUserId, role)
			.run();

		return c.json({ message: 'Membro adicionado com sucesso', id: newMemberId }, 201);
	} catch (err) {
		console.error('Erro ao adicionar membro:', err);
		return c.json({ error: 'Erro ao adicionar membro ao workspace' }, 500);
	}
});

// 4. GET /workspaces/:id/members - Listar membros do workspace
workspacesRouter.get('/:id/members', async (c) => {
	try {
		const workspaceId = c.req.param('id');
		const currentUserId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// Verificar se o usuário logado é membro do workspace
		const isMember = await db
			.prepare('SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, currentUserId)
			.first();

		if (!isMember) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const { results } = await db
			.prepare(`
				SELECT wm.id, wm.user_id as userId, u.name, u.email, wm.role, wm.invited_at as invitedAt
				FROM workspace_members wm
				INNER JOIN users u ON u.id = wm.user_id
				WHERE wm.workspace_id = ?
				ORDER BY wm.invited_at ASC
			`)
			.bind(workspaceId)
			.all();

		return c.json(results || []);
	} catch (err) {
		console.error('Erro ao listar membros:', err);
		return c.json({ error: 'Erro ao listar membros do workspace' }, 500);
	}
});

// 5. DELETE /workspaces/:id/members/:userId - Remover membro do workspace
workspacesRouter.delete('/:id/members/:userId', async (c) => {
	try {
		const workspaceId = c.req.param('id');
		const targetUserId = String(c.req.param('userId'));
		const currentUserId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// Verificar se o usuário logado é owner do workspace
		const currentMember = await db
			.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, currentUserId)
			.first<{ role: string }>();

		if (!currentMember || currentMember.role !== 'owner') {
			return c.json({ error: 'Apenas o proprietário (owner) pode remover membros' }, 403);
		}

		// Se estiver tentando remover a si mesmo, verificar se é o único owner
		if (targetUserId === currentUserId) {
			const ownerCountResult = await db
				.prepare("SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ? AND role = 'owner'")
				.bind(workspaceId)
				.first<{ count: number }>();

			const ownerCount = ownerCountResult?.count || 0;
			if (ownerCount <= 1) {
				return c.json({ error: 'Não é possível remover a si mesmo pois você é o único proprietário (owner) do workspace' }, 400);
			}
		}

		const result = await db
			.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, targetUserId)
			.run();

		if (result.meta.changes === 0) {
			return c.json({ error: 'Membro não encontrado neste workspace' }, 404);
		}

		return c.json({ message: 'Membro removido com sucesso' }, 200);
	} catch (err) {
		console.error('Erro ao remover membro:', err);
		return c.json({ error: 'Erro ao remover membro do workspace' }, 500);
	}
});

// 6. PUT /workspaces/:id - Editar nome/tipo do workspace (somente owner)
workspacesRouter.put('/:id', async (c) => {
	try {
		const workspaceId = c.req.param('id');
		const currentUserId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;
		const { name, type: inputType } = await c.req.json();

		if (!name || typeof name !== 'string' || name.trim() === '') {
			return c.json({ error: 'Nome do workspace é obrigatório' }, 400);
		}

		const type = ['personal', 'couple', 'business'].includes(inputType) ? inputType : undefined;

		// Verificar se o usuário logado é owner
		const member = await db
			.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, currentUserId)
			.first<{ role: string }>();

		if (!member || member.role !== 'owner') {
			return c.json({ error: 'Apenas o proprietário pode editar este workspace' }, 403);
		}

		const updateQuery = type
			? 'UPDATE workspaces SET name = ?, type = ? WHERE id = ?'
			: 'UPDATE workspaces SET name = ? WHERE id = ?';

		const bindArgs = type
			? [name.trim(), type, workspaceId]
			: [name.trim(), workspaceId];

		const result = await db.prepare(updateQuery).bind(...bindArgs).run();

		if (result.meta.changes === 0) {
			return c.json({ error: 'Workspace não encontrado' }, 404);
		}

		const updated = await db
			.prepare('SELECT id, name, type, created_at FROM workspaces WHERE id = ?')
			.bind(workspaceId)
			.first<{ id: string; name: string; type: string; created_at: string }>();

		return c.json({ ...updated, role: 'owner' }, 200);
	} catch (err) {
		console.error('Erro ao editar workspace:', err);
		return c.json({ error: 'Erro ao editar workspace' }, 500);
	}
});

// 7. DELETE /workspaces/:id - Excluir workspace (somente owner)
workspacesRouter.delete('/:id', async (c) => {
	try {
		const workspaceId = c.req.param('id');
		const currentUserId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// Verificar se o usuário logado é owner
		const member = await db
			.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, currentUserId)
			.first<{ role: string }>();

		if (!member || member.role !== 'owner') {
			return c.json({ error: 'Apenas o proprietário pode excluir este workspace' }, 403);
		}

		// Excluir membros primeiro (FK), depois o workspace
		await db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').bind(workspaceId).run();
		const result = await db.prepare('DELETE FROM workspaces WHERE id = ?').bind(workspaceId).run();

		if (result.meta.changes === 0) {
			return c.json({ error: 'Workspace não encontrado' }, 404);
		}

		return c.json({ message: 'Workspace excluído com sucesso' }, 200);
	} catch (err) {
		console.error('Erro ao excluir workspace:', err);
		return c.json({ error: 'Erro ao excluir workspace' }, 500);
	}
});

export default workspacesRouter;

