import { describe, it, expect } from 'vitest';
import {
	calculateInvoicePeriod,
	getInvoiceMonthForTransaction,
	calculateInvoiceForecast,
} from '../../src/utils/invoiceCalculator';

describe('invoiceCalculator - calculateInvoicePeriod', () => {
	it('deve calcular período padrão onde dueDay > closingDay', () => {
		// closing = 5, due = 15, mês = 2026-10
		const fixedNow = new Date(2026, 8, 15); // 15/09/2026
		const period = calculateInvoicePeriod(5, 15, '2026-10', fixedNow);

		expect(period.reference_month).toBe('2026-10');
		expect(period.start_date).toBe('2026-09-06');
		expect(period.closing_date).toBe('2026-10-05');
		expect(period.due_date).toBe('2026-10-15');
		expect(period.status).toBe('open');
	});

	it('deve calcular vencimento no mês seguinte quando dueDay <= closingDay', () => {
		// closing = 25, due = 5, mês = 2026-10 -> vence em 05/11/2026
		const fixedNow = new Date(2026, 9, 10); // 10/10/2026
		const period = calculateInvoicePeriod(25, 5, '2026-10', fixedNow);

		expect(period.start_date).toBe('2026-09-26');
		expect(period.closing_date).toBe('2026-10-25');
		expect(period.due_date).toBe('2026-11-05');
	});

	it('deve ajustar dias para meses com menos de 31 dias (ex: Fevereiro)', () => {
		// closing = 31, due = 10, mês = 2026-02 (28 dias)
		const period = calculateInvoicePeriod(31, 10, '2026-02');

		expect(period.closing_date).toBe('2026-02-28');
	});
});

describe('invoiceCalculator - getInvoiceMonthForTransaction', () => {
	it('compra antes do fechamento deve cair na fatura do mês atual', () => {
		const closingDay = 10;
		const ref = getInvoiceMonthForTransaction('2026-08-05', closingDay);
		expect(ref).toBe('2026-08');
	});

	it('compra após o fechamento deve cair na fatura do próximo mês', () => {
		const closingDay = 10;
		const ref = getInvoiceMonthForTransaction('2026-08-11', closingDay);
		expect(ref).toBe('2026-09');
	});

	it('compra após o fechamento em Dezembro deve cair em Janeiro do próximo ano', () => {
		const closingDay = 15;
		const ref = getInvoiceMonthForTransaction('2026-12-20', closingDay);
		expect(ref).toBe('2027-01');
	});
});

describe('invoiceCalculator - calculateInvoiceForecast', () => {
	it('deve prever parcelas futuras distribuídas nos próximos meses', () => {
		const sampleTransactions = [
			{ id: 1, description: 'Notebook 1/3', amount: 500.0, type: 'expense', installments: 3, installment_current: 1, date: '2026-08-02' },
			{ id: 2, description: 'Notebook 2/3', amount: 500.0, type: 'expense', installments: 3, installment_current: 2, date: '2026-09-02' },
			{ id: 3, description: 'Notebook 3/3', amount: 500.0, type: 'expense', installments: 3, installment_current: 3, date: '2026-10-02' },
		];

		const forecast = calculateInvoiceForecast(10, 20, sampleTransactions, 3, '2026-08');

		expect(forecast).toHaveLength(3);
		expect(forecast[0].reference_month).toBe('2026-08');
		expect(forecast[0].predicted_total).toBe(500.0);
		expect(forecast[1].reference_month).toBe('2026-09');
		expect(forecast[1].predicted_total).toBe(500.0);
		expect(forecast[2].reference_month).toBe('2026-10');
		expect(forecast[2].predicted_total).toBe(500.0);
	});
});
