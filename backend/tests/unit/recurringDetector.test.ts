import { describe, it, expect } from 'vitest';
import { detectRecurringPatterns, type TransactionForDetection } from '../../src/utils/recurringDetector';

describe('detectRecurringPatterns', () => {
	it('deve detectar padrão de recorrência mensal claro (Netflix)', () => {
		const sampleTx: TransactionForDetection[] = [
			{ id: 1, description: 'Netflix.com', amount: 55.9, type: 'expense', date: '2026-06-15', category_id: 4 },
			{ id: 2, description: 'Netflix.com', amount: 55.9, type: 'expense', date: '2026-07-15', category_id: 4 },
			{ id: 3, description: 'Netflix.com', amount: 55.9, type: 'expense', date: '2026-08-15', category_id: 4 },
		];

		const suggestions = detectRecurringPatterns(sampleTx);
		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].description).toBe('Netflix.com');
		expect(suggestions[0].amount).toBe(55.9);
		expect(suggestions[0].day_of_month).toBe(15);
		expect(suggestions[0].type).toBe('expense');
		expect(suggestions[0].confidence).toBe('high');
		expect(suggestions[0].category_id).toBe(4);
	});

	it('deve detectar contas de consumo com variação pequena de valor (Energia)', () => {
		const sampleTx: TransactionForDetection[] = [
			{ id: 10, description: 'Enel Distribuicao', amount: 150.0, type: 'expense', date: '2026-06-10' },
			{ id: 11, description: 'Enel Distribuicao', amount: 162.5, type: 'expense', date: '2026-07-09' },
			{ id: 12, description: 'Enel Distribuicao', amount: 148.2, type: 'expense', date: '2026-08-11' },
		];

		const suggestions = detectRecurringPatterns(sampleTx);
		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].description).toBe('Enel Distribuicao');
		expect(suggestions[0].type).toBe('expense');
		expect(suggestions[0].day_of_month).toBeGreaterThanOrEqual(9);
		expect(suggestions[0].day_of_month).toBeLessThanOrEqual(11);
	});

	it('não deve sugerir compras múltiplas feitas dentro de um mesmo mês', () => {
		const sampleTx: TransactionForDetection[] = [
			{ id: 20, description: 'Padaria da Esquina', amount: 20.0, type: 'expense', date: '2026-08-01' },
			{ id: 21, description: 'Padaria da Esquina', amount: 20.0, type: 'expense', date: '2026-08-05' },
			{ id: 22, description: 'Padaria da Esquina', amount: 20.0, type: 'expense', date: '2026-08-10' },
		];

		const suggestions = detectRecurringPatterns(sampleTx);
		expect(suggestions).toHaveLength(0);
	});
});
