import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import {
	generateAndPersistNotifications,
	getNotificationLinkAndSeverity,
	type PersistedNotification,
} from '../utils/notificationPersistence';

const notificationsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

notificationsRouter.use('*', authMiddleware);

async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// 1. GET /workspaces/:workspaceId/notifications - Listar notificações persistidas
notificationsRouter.get('/workspaces/:workspaceId/notifications', async (c) => {
	const workspaceId = c.req.param('workspaceId');
	const userId = String(c.get('userId'));

	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		if (!db) {
			return c.json({ error: 'Erro de configuração do servidor' }, 500);
		}

		if (!workspaceId || workspaceId.trim() === '') {
			return c.json({ error: 'ID de workspace inválido' }, 400);
		}

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		// Gera e persiste notificações em tempo real (faturas a vencer, saldo baixo, orçamentos)
		await generateAndPersistNotifications(db, workspaceId, userId);

		// Parâmetros de paginação e filtro
		const limitParam = Number(c.req.query('limit')) || 50;
		const limit = Math.min(Math.max(limitParam, 1), 100);
		const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
		const onlyUnread = c.req.query('unread') === 'true';

		// Query de listagem
		let listQuery = `
			SELECT id, workspace_id, user_id, type, title, message, related_entity_type, related_entity_id, is_read, created_at
			FROM notifications
			WHERE workspace_id = ? AND user_id = ?
		`;
		if (onlyUnread) {
			listQuery += ' AND is_read = 0';
		}
		listQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

		const { results: rawItems } = await db
			.prepare(listQuery)
			.bind(workspaceId, userId, limit, offset)
			.all<PersistedNotification>();

		// Contagem de não lidas
		const unreadCountResult = await db
			.prepare('SELECT COUNT(*) as unread_count FROM notifications WHERE workspace_id = ? AND user_id = ? AND is_read = 0')
			.bind(workspaceId, userId)
			.first<{ unread_count: number; count?: number }>();

		const unreadCount = unreadCountResult?.unread_count ?? unreadCountResult?.count ?? 0;

		// Contagem total
		const totalCountResult = await db
			.prepare('SELECT COUNT(*) as total FROM notifications WHERE workspace_id = ? AND user_id = ?')
			.bind(workspaceId, userId)
			.first<{ total: number; count?: number }>();

		const totalCount = totalCountResult?.total ?? totalCountResult?.count ?? (rawItems || []).length;

		// Formata itens com metadata de link e severidade
		const items = (rawItems || []).map((item) => {
			const { related_link, severity } = getNotificationLinkAndSeverity(
				item.type,
				item.related_entity_type
			);
			return {
				...item,
				is_read: Number(item.is_read) === 1,
				severity,
				related_link,
				created_context_date: item.created_at ? item.created_at.slice(0, 10) : undefined,
			};
		});

		return c.json({
			workspace_id: workspaceId,
			total_count: totalCount,
			total: totalCount,
			unread_count: unreadCount,
			notifications: items,
			items,
			limit,
			offset,
		});
	} catch (err: any) {
		console.error('[GET /notifications Error]', {
			workspaceId,
			userId,
			errorMessage: err?.message || String(err),
		});
		return c.json({ error: 'Erro ao listar notificações' }, 500);
	}
});

// 2. PATCH /workspaces/:workspaceId/notifications/:id/read - Marcar notificação como lida
notificationsRouter.patch('/workspaces/:workspaceId/notifications/:id/read', async (c) => {
	const workspaceId = c.req.param('workspaceId');
	const id = c.req.param('id');
	const userId = String(c.get('userId'));

	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		if (!db) {
			return c.json({ error: 'Erro de configuração do servidor' }, 500);
		}

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const existing = await db
			.prepare('SELECT id, workspace_id, user_id FROM notifications WHERE id = ? AND workspace_id = ?')
			.bind(id, workspaceId)
			.first<{ id: string; workspace_id: string; user_id: string }>();

		if (!existing) {
			return c.json({ error: 'Notificação não encontrada' }, 404);
		}

		if (String(existing.user_id) !== userId) {
			return c.json({ error: 'Acesso negado a esta notificação' }, 403);
		}

		await db
			.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND workspace_id = ?')
			.bind(id, workspaceId)
			.run();

		return c.json({ success: true, message: 'Notificação marcada como lida' });
	} catch (err: any) {
		console.error('[PATCH /notifications/:id/read Error]', err);
		return c.json({ error: 'Erro ao marcar notificação como lida' }, 500);
	}
});

// 3. PATCH /workspaces/:workspaceId/notifications/read-all - Marcar todas como lidas
notificationsRouter.patch('/workspaces/:workspaceId/notifications/read-all', async (c) => {
	const workspaceId = c.req.param('workspaceId');
	const userId = String(c.get('userId'));

	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		if (!db) {
			return c.json({ error: 'Erro de configuração do servidor' }, 500);
		}

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		await db
			.prepare('UPDATE notifications SET is_read = 1 WHERE workspace_id = ? AND user_id = ? AND is_read = 0')
			.bind(workspaceId, userId)
			.run();

		return c.json({ success: true, message: 'Todas as notificações foram marcadas como lidas' });
	} catch (err: any) {
		console.error('[PATCH /notifications/read-all Error]', err);
		return c.json({ error: 'Erro ao marcar todas as notificações como lidas' }, 500);
	}
});

// 4. DELETE /workspaces/:workspaceId/notifications/:id - Excluir notificação
notificationsRouter.delete('/workspaces/:workspaceId/notifications/:id', async (c) => {
	const workspaceId = c.req.param('workspaceId');
	const id = c.req.param('id');
	const userId = String(c.get('userId'));

	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		if (!db) {
			return c.json({ error: 'Erro de configuração do servidor' }, 500);
		}

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const existing = await db
			.prepare('SELECT id, workspace_id, user_id FROM notifications WHERE id = ? AND workspace_id = ?')
			.bind(id, workspaceId)
			.first<{ id: string; workspace_id: string; user_id: string }>();

		if (!existing) {
			return c.json({ error: 'Notificação não encontrada' }, 404);
		}

		if (String(existing.user_id) !== userId) {
			return c.json({ error: 'Acesso negado a esta notificação' }, 403);
		}

		await db
			.prepare('DELETE FROM notifications WHERE id = ? AND workspace_id = ?')
			.bind(id, workspaceId)
			.run();

		return c.json({ success: true, message: 'Notificação excluída com sucesso' });
	} catch (err: any) {
		console.error('[DELETE /notifications/:id Error]', err);
		return c.json({ error: 'Erro ao excluir notificação' }, 500);
	}
});

export default notificationsRouter;
