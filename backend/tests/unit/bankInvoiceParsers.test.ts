import { describe, it, expect } from 'vitest';
import {
	parseInvoiceByBank,
	detectBankFromText,
	extractNubankRaw,
	extractGenericRaw,
	extractGenericInvoiceHeader,
} from '../../src/utils/bankInvoiceParsers';

describe('Multi-Bank Invoice Parsers & Auto-Detection', () => {
	it('deve auto-detectar e extrair fatura do Nubank', () => {
		const nubankText = `
			Nubank - Nu Pagamentos S.A.
			Vencimento: 10 OUT 2026
			Total da Fatura: R$ 450,00

			Cartão final 6768
			15 JUL Restaurante Coco Bambu 02/05 R$ 220,00
			20 AGO Supermercado Pão de Açúcar 130,00
			02 SET Farmácia Drogasil 100,00
		`;

		const detected = detectBankFromText(nubankText);
		expect(detected).toBe('nubank');

		const result = parseInvoiceByBank(nubankText, 'auto');
		expect(result.detectedBank).toBe('nubank');
		expect(result.header.invoiceReferenceMonth).toBe('2026-10');
		expect(result.header.invoiceYear).toBe(2026);
		expect(result.header.invoiceMonth).toBe(10);
		expect(result.rawTransactions).toHaveLength(3);

		expect(result.rawTransactions[0].description).toBe('Restaurante Coco Bambu 02/05');
		expect(result.rawTransactions[0].amount).toBe(220);
		expect(result.rawTransactions[0].cardLastDigits).toBe('6768');
		expect(result.rawTransactions[0].installmentInfo).toEqual({ current: 2, total: 5 });
	});

	it('deve auto-detectar e extrair fatura do Banco Inter', () => {
		const interText = `
			Banco Inter S.A.
			Fatura Inter Mastercard
			Vencimento: 05/11/2026
			Valor Total: R$ 380,50

			Cartão Inter final 4321
			10/09/2026 Posto Shell Gasolina R$ 150,50
			18/09/2026 Netflix Assinatura 55,90
			25/09/2026 Leroy Merlin 01 DE 03 174,10
		`;

		const detected = detectBankFromText(interText);
		expect(detected).toBe('inter');

		const result = parseInvoiceByBank(interText, 'inter');
		expect(result.detectedBank).toBe('inter');
		expect(result.header.invoiceReferenceMonth).toBe('2026-11');
		expect(result.rawTransactions).toHaveLength(3);
		expect(result.rawTransactions[2].description).toBe('Leroy Merlin 01 DE 03');
		expect(result.rawTransactions[2].amount).toBe(174.1);
		expect(result.rawTransactions[2].installmentInfo).toEqual({ current: 1, total: 3 });
	});

	it('deve auto-detectar e extrair fatura do Itaú / Itaucard', () => {
		const itauText = `
			Itaú Unibanco S.A.
			Itaucard Visa Platinum
			Total da fatura: R$ 890,00
			Vencimento: 15/10/2026

			Cartão Final 9876
			05/09 Magazine Luiza 02/10 R$ 250,00
			12/09 Uber *Trip 45,00
			20/09 Smart Fit Mensalidade 119,90
		`;

		const detected = detectBankFromText(itauText);
		expect(detected).toBe('itau');

		const result = parseInvoiceByBank(itauText, 'itau');
		expect(result.detectedBank).toBe('itau');
		expect(result.header.invoiceReferenceMonth).toBe('2026-10');
		expect(result.rawTransactions).toHaveLength(3);
		expect(result.rawTransactions[0].description).toBe('Magazine Luiza 02/10');
		expect(result.rawTransactions[0].installmentInfo).toEqual({ current: 2, total: 10 });
	});

	it('deve auto-detectar e extrair fatura do Bradesco', () => {
		const bradescoText = `
			Bradesco Cartões
			Demonstrativo de Fatura
			Vencimento: 20/09/2026

			Cartão final 5544
			01/08 Carrefour Hipermercado 230,40 D
			10/08 Estorno Compra Cancelada 50,00 C
		`;

		const detected = detectBankFromText(bradescoText);
		expect(detected).toBe('bradesco');

		const result = parseInvoiceByBank(bradescoText, 'bradesco');
		expect(result.detectedBank).toBe('bradesco');
		expect(result.rawTransactions).toHaveLength(2);
		expect(result.rawTransactions[0].type).toBe('D');
		expect(result.rawTransactions[1].type).toBe('C');
	});

	it('deve auto-detectar e extrair fatura do Santander', () => {
		const santanderText = `
			Banco Santander (Brasil) S.A.
			Santander Way
			Vencimento: 12/09/2026

			Cartão SX final 3322
			15/08 Drogasil Farmacia 88,90
			22/08 Mercado Livre 03 DE 06 145,00
		`;

		const detected = detectBankFromText(santanderText);
		expect(detected).toBe('santander');

		const result = parseInvoiceByBank(santanderText, 'santander');
		expect(result.detectedBank).toBe('santander');
		expect(result.rawTransactions).toHaveLength(2);
		expect(result.rawTransactions[1].installmentInfo).toEqual({ current: 3, total: 6 });
	});

	it('deve auto-detectar e extrair fatura do Banco do Brasil (Ourocard)', () => {
		const bbText = `
			Banco do Brasil
			Ourocard Elo Nanquim
			Vencimento: 28/09/2026

			Ourocard final 7788
			05.08 Amazon Prime 19,90
			14.08 Restaurante Outback 185,00
		`;

		const detected = detectBankFromText(bbText);
		expect(detected).toBe('bb');

		const result = parseInvoiceByBank(bbText, 'bb');
		expect(result.detectedBank).toBe('bb');
		expect(result.rawTransactions).toHaveLength(2);
		expect(result.rawTransactions[0].amount).toBe(19.9);
	});

	it('deve auto-detectar e extrair fatura do C6 Bank', () => {
		const c6Text = `
			C6 Bank - Banco C6 S.A.
			Fatura C6 Carbon Mastercard
			Vencimento: 10/11/2026

			Cartão final 9911
			02/10 Apple Services 34,90
			15/10 Ifood *Restaurante 72,00
		`;

		const detected = detectBankFromText(c6Text);
		expect(detected).toBe('c6');

		const result = parseInvoiceByBank(c6Text, 'c6');
		expect(result.detectedBank).toBe('c6');
		expect(result.rawTransactions).toHaveLength(2);
	});

	it('deve processar extrato genérico com fallback seguro', () => {
		const genericText = `
			Demonstrativo Mensal
			Referência: 08/2026

			01/08 Pagamento Conta de Luz 140,00
			15/08 Pix Recebido de Cliente 500,00 C
		`;

		const result = parseInvoiceByBank(genericText, 'generic');
		expect(result.header.invoiceReferenceMonth).toBe('2026-08');
		expect(result.rawTransactions).toHaveLength(2);
		expect(result.rawTransactions[0].amount).toBe(140);
		expect(result.rawTransactions[1].type).toBe('C');
	});
});
