import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../../src/auth';

const SECRET = 'test-secret-key-for-unit-tests-1234567890';

// ─────────────────────────────────────────────────────────────────────────────
// hashPassword / comparePassword
// ─────────────────────────────────────────────────────────────────────────────

describe('hashPassword', () => {
	it('deve gerar um hash diferente da senha original', async () => {
		const hash = await hashPassword('minha-senha');
		expect(hash).not.toBe('minha-senha');
		expect(hash.length).toBeGreaterThan(20);
	});

	it('deve gerar hashes diferentes para a mesma senha (salt)', async () => {
		const h1 = await hashPassword('mesma-senha');
		const h2 = await hashPassword('mesma-senha');
		expect(h1).not.toBe(h2);
	});
});

describe('comparePassword', () => {
	it('deve retornar true para senha correta', async () => {
		const hash = await hashPassword('senha-certa');
		const result = await comparePassword('senha-certa', hash);
		expect(result).toBe(true);
	});

	it('deve retornar false para senha incorreta', async () => {
		const hash = await hashPassword('senha-certa');
		const result = await comparePassword('senha-errada', hash);
		expect(result).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// generateToken / verifyToken
// ─────────────────────────────────────────────────────────────────────────────

describe('generateToken', () => {
	it('deve gerar um token JWT com 3 partes separadas por ponto', async () => {
		const tk = await generateToken({ userId: 42, email: 'user@test.com' }, SECRET);
		expect(typeof tk).toBe('string');
		const parts = tk.split('.');
		expect(parts).toHaveLength(3);
	});

	it('deve gerar tokens diferentes para payloads diferentes', async () => {
		const tk1 = await generateToken({ userId: 1, email: 'a@test.com' }, SECRET);
		const tk2 = await generateToken({ userId: 2, email: 'b@test.com' }, SECRET);
		expect(tk1).not.toBe(tk2);
	});
});

describe('verifyToken', () => {
	it('deve retornar payload correto para token válido', async () => {
		const tk = await generateToken({ userId: 99, email: 'verify@test.com' }, SECRET);
		const payload = await verifyToken(tk, SECRET);
		expect(payload).not.toBeNull();
		expect(payload?.userId).toBe(99);
		expect(payload?.email).toBe('verify@test.com');
	});

	it('deve retornar null para token inválido', async () => {
		const payload = await verifyToken('token.invalido.aqui', SECRET);
		expect(payload).toBeNull();
	});

	it('deve retornar null se o secret for diferente', async () => {
		const tk = await generateToken({ userId: 1, email: 'x@x.com' }, SECRET);
		const payload = await verifyToken(tk, 'outro-secret-completamente-diferente');
		expect(payload).toBeNull();
	});
});
