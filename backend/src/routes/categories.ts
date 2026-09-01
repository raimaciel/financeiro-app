import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const categoriesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de categorias com authMiddleware
categoriesRouter.use('*', authMiddleware);

// Helper para verificar membro e permissões no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// 1. POST /workspaces/:workspaceId/categories - Criar categoria
categoriesRouter.post('/workspaces/:workspaceId/categories', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem criar categorias' }, 403);
		}

		const { name, icon, color, type } = await c.req.json();

		if (!name || typeof name !== 'string' || name.trim() === '') {
			return c.json({ error: 'Nome da categoria é obrigatório' }, 400);
		}

		if (!type || !['income', 'expense'].includes(type)) {
			return c.json({ error: 'Tipo inválido. Deve ser "income" ou "expense"' }, 400);
		}

		const categoryIcon = icon && typeof icon === 'string' ? icon.trim() : 'circle';
		const categoryColor = color && typeof color === 'string' ? color.trim() : '#999999';

		const result = await db
			.prepare('INSERT INTO categories (workspace_id, user_id, name, icon, color, type) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(workspaceId, userId, name.trim(), categoryIcon, categoryColor, type)
			.run();

		const categoryId = result.meta.last_row_id;

		return c.json({
			id: categoryId,
			workspaceId,
			userId,
			name: name.trim(),
			icon: categoryIcon,
			color: categoryColor,
			type,
		}, 201);
	} catch (err) {
		console.error('Erro ao criar categoria:', err);
		return c.json({ error: 'Erro ao criar categoria' }, 500);
	}
});

// 2. GET /workspaces/:workspaceId/categories - Listar categorias
categoriesRouter.get('/workspaces/:workspaceId/categories', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const typeFilter = c.req.query('type');
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		let query = 'SELECT id, workspace_id as workspaceId, user_id as userId, name, icon, color, type, created_at as createdAt FROM categories WHERE workspace_id = ?';
		const bindings: any[] = [workspaceId];

		if (typeFilter && ['income', 'expense'].includes(typeFilter)) {
			query += ' AND type = ?';
			bindings.push(typeFilter);
		}

		query += ' ORDER BY name ASC';

		const { results } = await db
			.prepare(query)
			.bind(...bindings)
			.all();

		return c.json(results || []);
	} catch (err) {
		console.error('Erro ao listar categorias:', err);
		return c.json({ error: 'Erro ao listar categorias' }, 500);
	}
});

// 3. PUT /workspaces/:workspaceId/categories/:id - Atualizar categoria
categoriesRouter.put('/workspaces/:workspaceId/categories/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const categoryId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem editar categorias' }, 403);
		}

		const existingCategory = await db
			.prepare('SELECT id, name, icon, color, type FROM categories WHERE id = ? AND workspace_id = ?')
			.bind(categoryId, workspaceId)
			.first();

		if (!existingCategory) {
			return c.json({ error: 'Categoria não encontrada' }, 404);
		}

		const body = await c.req.json();
		const name = body.name !== undefined ? String(body.name).trim() : existingCategory.name;
		const icon = body.icon !== undefined ? String(body.icon).trim() : existingCategory.icon;
		const color = body.color !== undefined ? String(body.color).trim() : existingCategory.color;
		const type = body.type !== undefined && ['income', 'expense'].includes(body.type) ? body.type : existingCategory.type;

		if (!name) {
			return c.json({ error: 'Nome da categoria não pode ser vazio' }, 400);
		}

		await db
			.prepare('UPDATE categories SET name = ?, icon = ?, color = ?, type = ? WHERE id = ? AND workspace_id = ?')
			.bind(name, icon, color, type, categoryId, workspaceId)
			.run();

		return c.json({
			id: Number(categoryId),
			workspaceId,
			name,
			icon,
			color,
			type,
		}, 200);
	} catch (err) {
		console.error('Erro ao atualizar categoria:', err);
		return c.json({ error: 'Erro ao atualizar categoria' }, 500);
	}
});

// 4. DELETE /workspaces/:workspaceId/categories/:id - Deletar categoria
categoriesRouter.delete('/workspaces/:workspaceId/categories/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const categoryId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem deletar categorias' }, 403);
		}

		const existingCategory = await db
			.prepare('SELECT id FROM categories WHERE id = ? AND workspace_id = ?')
			.bind(categoryId, workspaceId)
			.first();

		if (!existingCategory) {
			return c.json({ error: 'Categoria não encontrada' }, 404);
		}

		// Verificar se a categoria está sendo usada em alguma transação
		const usage = await db
			.prepare('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?')
			.bind(categoryId)
			.first<{ count: number }>();

		if (usage && usage.count > 0) {
			return c.json({ error: 'Categoria em uso, não pode ser removida' }, 400);
		}

		await db
			.prepare('DELETE FROM categories WHERE id = ? AND workspace_id = ?')
			.bind(categoryId, workspaceId)
			.run();

		return c.json({ message: 'Categoria removida com sucesso' }, 200);
	} catch (err) {
		console.error('Erro ao deletar categoria:', err);
		return c.json({ error: 'Erro ao deletar categoria' }, 500);
	}
});

export default categoriesRouter;
