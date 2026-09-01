import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import type { Context, Next } from 'hono';

export type Bindings = {
	financeiro_db: D1Database;
	DB?: D1Database;
	financeiro_comprovantes: R2Bucket;
	JWT_SECRET: string;
};

export type Variables = {
	userId: number | string;
	userEmail: string;
	isAdmin?: boolean;
};

// Gera o hash da senha antes de salvar no banco
export async function hashPassword(password: string): Promise<string> {
	const salt = bcrypt.genSaltSync(10);
	return bcrypt.hashSync(password, salt);
}

// Compara a senha digitada com o hash salvo no banco
export async function comparePassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compareSync(password, hash);
}

// Gera um token JWT válido por 7 dias
export async function generateToken(payload: { userId: number | string; email: string }, secret: string): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 dias
	return sign({ ...payload, exp }, secret, 'HS256');
}

// Verifica se o token é válido e retorna os dados do usuário
export async function verifyToken(token: string, secret: string) {
	try {
		return await verify(token, secret, 'HS256');
	} catch (err) {
		console.error('Erro ao verificar token:', err);
		return null;
	}
}

// Middleware que protege rotas exigindo token JWT válido e usuário ativo
export async function authMiddleware(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
	const authHeader = c.req.header('Authorization');

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json({ error: 'Token não fornecido' }, 401);
	}

	const token = authHeader.replace('Bearer ', '');
	const payload = await verifyToken(token, c.env.JWT_SECRET);

	if (!payload) {
		return c.json({ error: 'Token inválido ou expirado' }, 401);
	}

	const db = c.env.financeiro_db || (c.env as any).DB;
	if (db) {
		const user = await db
			.prepare('SELECT is_active, is_admin FROM users WHERE id = ?')
			.bind(payload.userId)
			.first<{ is_active: number; is_admin: number }>();

		// Se o usuário existir e estiver desativado/bloqueado, rejeita a requisição
		if (user && user.is_active === 0) {
			return c.json({ error: 'Sua conta foi bloqueada. Contate o administrador.' }, 403);
		}

		c.set('isAdmin', user ? user.is_admin === 1 : false);
	}

	c.set('userId', payload.userId as number | string);
	c.set('userEmail', payload.email as string);

	await next();
}
