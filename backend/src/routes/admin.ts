import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const adminRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de administração com autenticação
adminRouter.use('*', authMiddleware);

// Middleware para verificar se o usuário é administrador
adminRouter.use('*', async (c, next) => {
	const isAdmin = c.get('isAdmin');
	if (!isAdmin) {
		return c.json({ error: 'Acesso negado. Apenas administradores podem acessar esta funcionalidade.' }, 403);
	}
	await next();
});

// 1. GET /admin/users - Listar todos os usuários cadastrados
adminRouter.get('/admin/users', async (c) => {
	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		if (!db) {
			return c.json({ error: 'Banco de dados não disponível' }, 500);
		}

		const { results } = await db
			.prepare('SELECT id, name, email, is_active, is_admin, created_at FROM users ORDER BY id ASC')
			.all<{ id: number; name: string; email: string; is_active: number; is_admin: number; created_at: string }>();

		const formattedUsers = (results || []).map((u) => ({
			id: u.id,
			name: u.name,
			email: u.email,
			is_active: u.is_active === 1,
			isActive: u.is_active === 1,
			is_admin: u.is_admin === 1,
			isAdmin: u.is_admin === 1,
			created_at: u.created_at,
		}));

		return c.json(formattedUsers, 200);
	} catch (err: any) {
		console.error('[GET /admin/users Error]', err);
		return c.json({ error: 'Erro ao listar usuários' }, 500);
	}
});

// 2. PATCH /admin/users/:id/toggle-status - Bloquear ou desbloquear um usuário
adminRouter.patch('/admin/users/:id/toggle-status', async (c) => {
	try {
		const targetUserId = c.req.param('id');
		const currentUserId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		if (!db) {
			return c.json({ error: 'Banco de dados não disponível' }, 500);
		}

		if (String(targetUserId) === String(currentUserId)) {
			return c.json({ error: 'Você não pode bloquear sua própria conta de administrador.' }, 400);
		}

		const user = await db
			.prepare('SELECT id, name, email, is_active, is_admin FROM users WHERE id = ?')
			.bind(targetUserId)
			.first<{ id: number; name: string; email: string; is_active: number; is_admin: number }>();

		if (!user) {
			return c.json({ error: 'Usuário não encontrado' }, 404);
		}

		const newStatus = user.is_active === 1 ? 0 : 1;

		await db
			.prepare('UPDATE users SET is_active = ? WHERE id = ?')
			.bind(newStatus, targetUserId)
			.run();

		return c.json({
			message: newStatus === 1 ? 'Usuário desbloqueado com sucesso' : 'Usuário bloqueado com sucesso',
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				is_active: newStatus === 1,
				isActive: newStatus === 1,
				is_admin: user.is_admin === 1,
				isAdmin: user.is_admin === 1,
			},
		}, 200);
	} catch (err: any) {
		console.error('[PATCH /admin/users/:id/toggle-status Error]', err);
		return c.json({ error: 'Erro ao alterar status do usuário' }, 500);
	}
});

// 2.1. PATCH /admin/users/:id - Edição de dados do usuário (nome, is_active, is_admin)
adminRouter.patch('/admin/users/:id', async (c) => {
	try {
		const targetUserId = c.req.param('id');
		const body = await c.req.json().catch(() => ({}));
		const { name, is_active, is_admin } = body;
		const db = c.env.financeiro_db || (c.env as any).DB;

		if (!db) {
			return c.json({ error: 'Banco de dados não disponível' }, 500);
		}

		// Verifica se o usuário existe
		const existingUser = await db
			.prepare('SELECT id, name, email, is_active, is_admin, created_at FROM users WHERE id = ?')
			.bind(targetUserId)
			.first<{ id: number; name: string; email: string; is_active: number; is_admin: number; created_at: string }>();

		if (!existingUser) {
			return c.json({ error: 'Usuário não encontrado' }, 404);
		}

		const updates: string[] = [];
		const values: any[] = [];

		if (name !== undefined) {
			const trimmedName = String(name).trim();
			if (trimmedName.length < 2) {
				return c.json({ error: 'O nome deve ter pelo menos 2 caracteres' }, 400);
			}
			updates.push('name = ?');
			values.push(trimmedName);
		}

		if (is_active !== undefined) {
			const activeInt = (is_active === true || is_active === 1 || is_active === '1') ? 1 : 0;
			updates.push('is_active = ?');
			values.push(activeInt);
		}

		if (is_admin !== undefined) {
			const adminInt = (is_admin === true || is_admin === 1 || is_admin === '1') ? 1 : 0;
			updates.push('is_admin = ?');
			values.push(adminInt);
		}

		if (updates.length > 0) {
			values.push(targetUserId);
			await db
				.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
				.bind(...values)
				.run();
		}

		const updatedUser = await db
			.prepare('SELECT id, name, email, is_active, is_admin, created_at FROM users WHERE id = ?')
			.bind(targetUserId)
			.first<{ id: number; name: string; email: string; is_active: number; is_admin: number; created_at: string }>();

		return c.json({
			message: 'Usuário atualizado com sucesso',
			user: {
				id: updatedUser!.id,
				name: updatedUser!.name,
				email: updatedUser!.email,
				is_active: updatedUser!.is_active === 1,
				isActive: updatedUser!.is_active === 1,
				is_admin: updatedUser!.is_admin === 1,
				isAdmin: updatedUser!.is_admin === 1,
				created_at: updatedUser!.created_at,
			},
		}, 200);
	} catch (err: any) {
		console.error('[PATCH /admin/users/:id Error]', err);
		return c.json({ error: 'Erro ao atualizar usuário' }, 500);
	}
});

// 3. GET /admin/invite-codes - Listar todos os códigos de convite
adminRouter.get('/admin/invite-codes', async (c) => {
	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		if (!db) {
			return c.json({ error: 'Banco de dados não disponível' }, 500);
		}

		const { results } = await db
			.prepare(`
				SELECT i.*, u.name as used_by_user_name, u.email as used_by_user_email
				FROM invite_codes i
				LEFT JOIN users u ON i.used_by_user_id = u.id
				ORDER BY i.created_at DESC
			`)
			.all<any>();

		const now = new Date();

		const formattedCodes = (results || []).map((row) => {
			const expirationDate = new Date(row.expires_at);
			const isExpired = now.getTime() > expirationDate.getTime();
			const isExhausted = row.uses_count >= row.max_uses;

			let status: 'ativo' | 'expirado' | 'esgotado' = 'ativo';
			if (isExhausted) {
				status = 'esgotado';
			} else if (isExpired) {
				status = 'expirado';
			}

			return {
				id: row.id,
				code: row.code,
				expires_at: row.expires_at,
				used_at: row.used_at,
				used_by_user_id: row.used_by_user_id,
				used_by_user_name: row.used_by_user_name,
				used_by_user_email: row.used_by_user_email,
				created_by_admin_id: row.created_by_admin_id,
				max_uses: row.max_uses,
				uses_count: row.uses_count,
				created_at: row.created_at,
				is_expired: isExpired,
				is_exhausted: isExhausted,
				status,
			};
		});

		return c.json(formattedCodes, 200);
	} catch (err: any) {
		console.error('[GET /admin/invite-codes Error]', err);
		return c.json({ error: 'Erro ao listar códigos de convite' }, 500);
	}
});

// 4. POST /admin/invite-codes - Gerar novo código de convite com validade e limite de usos
adminRouter.post('/admin/invite-codes', async (c) => {
	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		const adminId = c.get('userId');

		if (!db) {
			return c.json({ error: 'Banco de dados não disponível' }, 500);
		}

		const body = await c.req.json().catch(() => ({}));
		const hoursValid = Number(body.hoursValid) || 24; // Padrão: 24 horas
		const maxUses = Number(body.maxUses) || 1; // Padrão: 1 uso

		// Gera código único (ex: INV-7K9F2A) ou usa customCode se fornecido
		let code = body.code ? String(body.code).trim().toUpperCase() : '';
		if (!code) {
			const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
			code = `INV-${randomSuffix}`;
		}

		// Checa se o código já existe
		const existing = await db
			.prepare('SELECT id FROM invite_codes WHERE UPPER(code) = ?')
			.bind(code)
			.first();

		if (existing) {
			return c.json({ error: 'Este código de convite já existe. Escolha outro ou gere automaticamente.' }, 409);
		}

		// Calcula expiração
		const expiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000).toISOString();

		const result = await db
			.prepare(`
				INSERT INTO invite_codes (code, expires_at, created_by_admin_id, max_uses, uses_count)
				VALUES (?, ?, ?, ?, 0)
			`)
			.bind(code, expiresAt, Number(adminId), maxUses)
			.run();

		const id = result.meta.last_row_id;

		return c.json({
			message: 'Código de convite gerado com sucesso',
			inviteCode: {
				id,
				code,
				expires_at: expiresAt,
				max_uses: maxUses,
				uses_count: 0,
				created_by_admin_id: Number(adminId),
				status: 'ativo',
			},
		}, 201);
	} catch (err: any) {
		console.error('[POST /admin/invite-codes Error]', err);
		return c.json({ error: 'Erro ao gerar código de convite' }, 500);
	}
});

// 5. DELETE /admin/invite-codes/:id - Revogar / excluir código de convite
adminRouter.delete('/admin/invite-codes/:id', async (c) => {
	try {
		const db = c.env.financeiro_db || (c.env as any).DB;
		const id = c.req.param('id');

		if (!db) {
			return c.json({ error: 'Banco de dados não disponível' }, 500);
		}

		const existing = await db
			.prepare('SELECT id, code FROM invite_codes WHERE id = ?')
			.bind(id)
			.first();

		if (!existing) {
			return c.json({ error: 'Código de convite não encontrado' }, 404);
		}

		await db.prepare('DELETE FROM invite_codes WHERE id = ?').bind(id).run();

		return c.json({ message: 'Código de convite revogado com sucesso' }, 200);
	} catch (err: any) {
		console.error('[DELETE /admin/invite-codes/:id Error]', err);
		return c.json({ error: 'Erro ao revogar código de convite' }, 500);
	}
});

export default adminRouter;
