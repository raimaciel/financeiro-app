import { describe, it, expect } from 'vitest';
import { calculatePendingDates, generateTransactionsForRule, type RecurringRule } from '../../src/utils/recurringGenerator';

describe('calculatePendingDates', () => {
	const baseRule: RecurringRule = {
		id: 'rec-1',
		workspace_id: 'ws-1',
		user_id: 1,
		description: 'Aluguel',
		amount: 1200.0,
		type: 'expense',
		frequency: 'monthly',
		day_of_month: 5,
		start_date: '2026-06-01',
		status: 'active',
		last_generated_date: null,
	};

	it('deve calcular todas as datas pendentes do start_date até a data alvo', () => {
		const targetDate = '2026-08-31';
		const dates = calculatePendingDates(baseRule, targetDate);

		expect(dates).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
	});

	it('deve respeitar last_generated_date e não gerar duplicatas', () => {
		const ruleWithLastGen: RecurringRule = {
			...baseRule,
			last_generated_date: '2026-07-05',
		};

		const targetDate = '2026-09-10';
		const dates = calculatePendingDates(ruleWithLastGen, targetDate);

		expect(dates).toEqual(['2026-08-05', '2026-09-05']);
	});

	it('deve retornar array vazio se status for paused', () => {
		const pausedRule: RecurringRule = {
			...baseRule,
			status: 'paused',
		};

		const dates = calculatePendingDates(pausedRule, '2026-08-31');
		expect(dates).toEqual([]);
	});

	it('deve respeitar end_date limite', () => {
		const ruleWithEnd: RecurringRule = {
			...baseRule,
			end_date: '2026-07-31',
		};

		const dates = calculatePendingDates(ruleWithEnd, '2026-09-30');
		expect(dates).toEqual(['2026-06-05', '2026-07-05']);
	});
});

describe('generateTransactionsForRule', () => {
	it('deve gerar payloads prontos para gravação e novo last_generated_date', () => {
		const rule: RecurringRule = {
			id: 'rec-2',
			workspace_id: 'ws-1',
			user_id: 1,
			description: 'Internet Fibra',
			amount: 99.9,
			type: 'expense',
			category_id: 6,
			frequency: 'monthly',
			day_of_month: 10,
			start_date: '2026-07-01',
			status: 'active',
			last_generated_date: null,
		};

		const { transactions, newLastGeneratedDate } = generateTransactionsForRule(rule, '2026-08-15');

		expect(transactions).toHaveLength(2);
		expect(transactions[0].date).toBe('2026-07-10');
		expect(transactions[0].amount).toBe(99.9);
		expect(transactions[0].description).toBe('Internet Fibra');
		expect(transactions[0].category_id).toBe(6);
		expect(transactions[1].date).toBe('2026-08-10');

		expect(newLastGeneratedDate).toBe('2026-08-10');
	});
});
