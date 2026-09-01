/**
 * Setup global para testes do backend com Vitest.
 * Adiciona shims para as globals do Cloudflare Workers que não existem no Node.js.
 */

// crypto.randomUUID está disponível no Node 19+, mas garantimos aqui
import { vi } from 'vitest';

// FormData e File estão disponíveis no Node 18+ via global
// D1Database e R2Bucket são tipos do TypeScript, não existem em runtime no Node —
// os mocks em helpers/mocks.ts simulam essas interfaces.

// Garante que console.error não polua a saída dos testes (erros esperados nos mocks)
const originalError = console.error;
vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
	// Silencia apenas erros esperados de JWT inválido nos testes de unidade
	const msg = String(args[0] || '');
	if (msg.includes('Erro ao verificar token') || msg.includes('Erro ao gerar')) return;
	originalError(...args);
});
