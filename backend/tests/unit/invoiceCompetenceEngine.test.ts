import { describe, it, expect } from 'vitest';
import { normalizeInvoiceTransactions, type RawExtractedTransaction, type RawInvoiceHeader } from '../../src/utils/invoiceCompetenceEngine';

describe('Bank-Agnostic Invoice Competence Engine (Camada 2)', () => {
	it('deve aplicar competência da fatura (Setembro/2026) a todas as compras parceladas feitas em meses anteriores (Junho/Maio)', () => {
		const rawTransactions: RawExtractedTransaction[] = [
			{
				description: 'NORMATEL HOME CENTER 03 DE 03 FORTALEZA',
				amount: 154.3,
				type: 'D',
				originalDate: '06/06', // Compra feita em Junho
				cardLastDigits: '2583',
				installmentInfo: { current: 3, total: 3 },
				sourceBank: 'caixa',
			},
			{
				description: 'AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR',
				amount: 89.9,
				type: 'D',
				originalDate: '07/05', // Compra feita em Maio
				cardLastDigits: '2583',
				installmentInfo: { current: 4, total: 4 },
				sourceBank: 'caixa',
			},
		];

		const header: RawInvoiceHeader = {
			invoiceReferenceMonth: '2026-09',
			invoiceYear: 2026,
			invoiceMonth: 9,
			invoiceDueDate: '2026-09-10',
			sourceBank: 'caixa',
		};

		const workspaceCards = [
			{ id: 'card-uuid-2583', name: 'Caixa Sim Internacional', last_four_digits: '2583', brand: 'Visa' },
		];

		const result = normalizeInvoiceTransactions(rawTransactions, header, workspaceCards);

		expect(result.mesReferenciaFatura).toBe('2026-09');
		expect(result.anoFatura).toBe(2026);
		expect(result.mesFatura).toBe(9);
		expect(result.transactions).toHaveLength(2);

		// Transação 1: Compra de 06/06 cai com competência 2026-09-06
		const tx1 = result.transactions[0];
		expect(tx1.date).toBe('2026-09-06');
		expect(tx1.dataCompetencia).toBe('2026-09-06');
		expect(tx1.dataTransacao).toBe('06/06');
		expect(tx1.description).toBe('NORMATEL HOME CENTER 03 DE 03 FORTALEZA');
		expect(tx1.creditCardId).toBe('card-uuid-2583');
		expect(tx1.cartaoIdentificado).toBe(true);
		expect(tx1.installments).toBe(3);
		expect(tx1.installmentCurrent).toBe(3);

		// Transação 2: Compra de 07/05 cai com competência 2026-09-07
		const tx2 = result.transactions[1];
		expect(tx2.date).toBe('2026-09-07');
		expect(tx2.dataCompetencia).toBe('2026-09-07');
		expect(tx2.dataTransacao).toBe('07/05');
		expect(tx2.description).toBe('AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR');
		expect(tx2.creditCardId).toBe('card-uuid-2583');
		expect(tx2.cartaoIdentificado).toBe(true);
	});

	it('deve funcionar de forma idêntica para qualquer outro banco (ex: Nubank, Itaú)', () => {
		const rawTransactions: RawExtractedTransaction[] = [
			{
				description: 'RESTAURANTE COCO BAMBU 02/05',
				amount: 220.0,
				type: 'D',
				originalDate: '15/07', // Compra feita em Julho
				cardLastDigits: '6768',
				installmentInfo: { current: 2, total: 5 },
				sourceBank: 'nubank',
			},
		];

		const header: RawInvoiceHeader = {
			invoiceReferenceMonth: '2026-09',
			invoiceYear: 2026,
			invoiceMonth: 9,
			sourceBank: 'nubank',
		};

		const workspaceCards = [
			{ id: 'card-uuid-6768', name: 'Nubank Roxinho', last_four_digits: '6768', brand: 'Mastercard' },
		];

		const result = normalizeInvoiceTransactions(rawTransactions, header, workspaceCards);
		expect(result.transactions[0].date).toBe('2026-09-15');
		expect(result.transactions[0].creditCardId).toBe('card-uuid-6768');
	});
});
