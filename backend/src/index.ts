import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, hashPassword, comparePassword, generateToken } from './auth';
import type { Bindings, Variables } from './auth';
import workspacesRouter from './routes/workspaces';
import categoriesRouter from './routes/categories';
import creditCardsRouter from './routes/credit-cards';
import transactionsRouter from './routes/transactions';
import invoicesRouter from './routes/invoices';
import dashboardRouter from './routes/dashboard';
import importRouter from './routes/import';
import recurringRouter from './routes/recurring';
import budgetsRouter from './routes/budgets';
import notificationsRouter from './routes/notifications';
import adminRouter from './routes/admin';
import accountsRouter from './routes/accounts';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Configurar CORS
app.use(
	'*',
	cors({
		origin: (origin) => {
			if (!origin) return '*';
			if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
				return origin;
			}
			if (origin.includes('pages.dev') || origin.includes('workers.dev')) {
				return origin;
			}
			return origin;
		},
		allowHeaders: ['Content-Type', 'Authorization'],
		allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
		exposeHeaders: ['Content-Length'],
		maxAge: 600,
		credentials: true,
	})
);

// Rota pública de health check
app.get('/', (c) => {
	return c.json({ status: 'ok', message: 'API Financeiro rodando 🚀' });
});

// Rota de cadastro com validação obrigatória de código de convite
app.post('/register', async (c) => {
	try {
		const { name, email, password, inviteCode } = await c.req.json();
		const db = c.env.financeiro_db || (c.env as any).DB;

		if (!name || !email || !password) {
			return c.json({ error: 'Nome, email e senha são obrigatórios' }, 400);
		}

		if (!inviteCode || !String(inviteCode).trim()) {
			return c.json({ error: 'O código de convite é obrigatório' }, 403);
		}

		const cleanCode = String(inviteCode).trim().toUpperCase();

		// 1. Busca código na tabela invite_codes
		let inviteRecordId: number | null = null;
		const dbInvite = await db
			.prepare('SELECT id, code, expires_at, max_uses, uses_count FROM invite_codes WHERE UPPER(code) = ?')
			.bind(cleanCode)
			.first<{ id: number; code: string; expires_at: string; max_uses: number; uses_count: number }>();

		if (!dbInvite) {
			return c.json({ error: 'Código de convite inválido ou não encontrado' }, 403);
		}

		const now = new Date();
		const expirationDate = new Date(dbInvite.expires_at);

		if (now.getTime() > expirationDate.getTime()) {
			return c.json({ error: 'Este código de convite está expirado' }, 403);
		}

		if (dbInvite.uses_count >= dbInvite.max_uses) {
			return c.json({ error: 'Este código de convite já esgotou o limite de utilizações' }, 403);
		}

		inviteRecordId = dbInvite.id;

		const existing = await db
			.prepare('SELECT id FROM users WHERE email = ?')
			.bind(email)
			.first();

		if (existing) {
			return c.json({ error: 'Este email já está cadastrado' }, 409);
		}

		const passwordHash = await hashPassword(password);

		const result = await db
			.prepare('INSERT INTO users (name, email, password_hash, is_active, is_admin) VALUES (?, ?, ?, 1, 0)')
			.bind(name, email, passwordHash)
			.run();

		const userId = result.meta.last_row_id;

		// Criação automática do workspace padrão para o novo usuário
		const workspaceId = crypto.randomUUID();
		const memberId = crypto.randomUUID();
		const defaultWorkspaceName = 'Meu Workspace';

		await db
			.prepare('INSERT INTO workspaces (id, name, type) VALUES (?, ?, ?)')
			.bind(workspaceId, defaultWorkspaceName, 'personal')
			.run();

		await db
			.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)')
			.bind(memberId, workspaceId, String(userId), 'owner')
			.run();

		// Registra o uso do código de convite se foi um código do banco
		if (inviteRecordId) {
			await db
				.prepare("UPDATE invite_codes SET uses_count = uses_count + 1, used_at = datetime('now'), used_by_user_id = ? WHERE id = ?")
				.bind(Number(userId), inviteRecordId)
				.run();
		}

		const token = await generateToken({ userId: Number(userId), email }, c.env.JWT_SECRET);

		return c.json({
			message: 'Usuário cadastrado com sucesso',
			token,
			user: {
				id: userId,
				name,
				email,
				is_active: true,
				isActive: true,
				is_admin: false,
				isAdmin: false,
			},
		}, 201);
	} catch (err) {
		console.error('[POST /register Error]', err);
		return c.json({ error: 'Erro ao cadastrar usuário' }, 500);
	}
});

// Rota de login com verificação de bloqueio
app.post('/login', async (c) => {
	try {
		const { email, password } = await c.req.json();
		const db = c.env.financeiro_db || (c.env as any).DB;

		if (!email || !password) {
			return c.json({ error: 'Email e senha são obrigatórios' }, 400);
		}

		const user = await db
			.prepare('SELECT id, name, email, password_hash, is_active, is_admin FROM users WHERE email = ?')
			.bind(email)
			.first<{ id: number; name: string; email: string; password_hash: string; is_active: number; is_admin: number }>();

		if (!user) {
			return c.json({ error: 'Email ou senha inválidos' }, 401);
		}

		// Verificar se o usuário está bloqueado
		if (user.is_active === 0) {
			return c.json({ error: 'Sua conta foi bloqueada. Contate o administrador.' }, 403);
		}

		const isValid = await comparePassword(password, user.password_hash);

		if (!isValid) {
			return c.json({ error: 'Email ou senha inválidos' }, 401);
		}

		const token = await generateToken({ userId: user.id, email: user.email }, c.env.JWT_SECRET);

		return c.json({
			message: 'Login realizado com sucesso',
			token,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				is_active: user.is_active === 1,
				isActive: user.is_active === 1,
				is_admin: user.is_admin === 1,
				isAdmin: user.is_admin === 1,
			},
		}, 200);
	} catch (err) {
		console.error('[POST /login Error]', err);
		return c.json({ error: 'Erro ao realizar login' }, 500);
	}
});

// Rota protegida de teste — só acessa com token válido e usuário ativo
app.get('/me', authMiddleware, async (c) => {
	const userId = c.get('userId');
	const userEmail = c.get('userEmail');
	const isAdmin = !!c.get('isAdmin');
	return c.json({
		userId,
		userEmail,
		is_admin: isAdmin,
		isAdmin,
		is_active: true,
		isActive: true,
	});
});

// Registrar rotas dos módulos
app.route('/workspaces', workspacesRouter);
app.route('/', categoriesRouter);
app.route('/', creditCardsRouter);
app.route('/', transactionsRouter);
app.route('/', invoicesRouter);
app.route('/', dashboardRouter);
app.route('/', importRouter);
app.route('/api', importRouter);
app.route('/', recurringRouter);
app.route('/', budgetsRouter);
app.route('/', notificationsRouter);
app.route('/', accountsRouter);
app.route('/', adminRouter);

// Handler global de erros (garante log detalhado no Cloudflare Workers / wrangler tail)
app.onError((err, c) => {
	console.error('[Worker Global Error]', {
		url: c.req.url,
		method: c.req.method,
		errorMessage: err.message,
		errorName: err.name,
		stack: err.stack,
	});
	return c.json(
		{
			error: 'Erro interno do servidor',
			message: err.message,
		},
		500
	);
});

// Handler global para 404
app.notFound((c) => {
	console.warn('[Worker 404 Not Found]', {
		url: c.req.url,
		method: c.req.method,
	});
	return c.json(
		{
			error: 'Rota não encontrada',
			path: c.req.path,
		},
		404
	);
});

export default app;
