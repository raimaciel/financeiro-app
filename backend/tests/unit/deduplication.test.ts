import { describe, it, expect } from 'vitest';
import { generateDuplicateHash, checkDuplicate } from '../../src/utils/deduplication';

describe('generateDuplicateHash', () => {
	it('deve gerar hash determinístico com data, valor e texto limpo', () => {
		const hash1 = generateDuplicateHash('2026-08-15', 150.5, 'Supermercado Extra');
		const hash2 = generateDuplicateHash('2026-08-15', 150.5, 'supermercado  extra');
		expect(hash1).toBe(hash2);
		expect(hash1).toBe('2026-08-15_150.50_SUPERMERCADOEXTRA');
	});
});

describe('checkDuplicate', () => {
	const existingTransactions = [
		{
			id: 1,
			date: '2026-08-15',
			amount: 150.5,
			description: 'Supermercado Extra',
		},
		{
			id: 2,
			date: '2026-08-10',
			amount: 89.9,
			description: 'Uber *Trip',
		},
	];

	it('deve marcar como duplicada transação com mesma data, valor e descrição similar', () => {
		const item = {
			date: '2026-08-15',
			amount: 150.5,
			description: 'Supermercado Extra Loja 01',
		};

		const res = checkDuplicate(item, existingTransactions);
		expect(res.isPossibleDuplicate).toBe(true);
		expect(res.matchedTransactionId).toBe(1);
		expect(res.duplicateReason).toContain('Transação similar já cadastrada em 2026-08-15');
	});

	it('deve marcar como duplicada transação com data no dia adjacente e descrição idêntica', () => {
		const item = {
			date: '2026-08-11', // 1 dia de diferença por compensação bancária
			amount: 89.9,
			description: 'Uber *Trip',
		};

		const res = checkDuplicate(item, existingTransactions);
		expect(res.isPossibleDuplicate).toBe(true);
		expect(res.matchedTransactionId).toBe(2);
	});

	it('não deve marcar como duplicada transação com data ou valor diferentes', () => {
		const item = {
			date: '2026-08-20',
			amount: 150.5,
			description: 'Supermercado Extra',
		};

		const res = checkDuplicate(item, existingTransactions);
		expect(res.isPossibleDuplicate).toBe(false);
		expect(res.matchedTransactionId).toBeNull();
	});
});
