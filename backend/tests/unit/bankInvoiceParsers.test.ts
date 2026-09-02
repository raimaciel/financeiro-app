import { describe, it, expect } from 'vitest';
import {
	parseInvoiceByBank,
	detectBankFromText,
	extractNubankRaw,
	extractGenericRaw,
	extractGenericInvoiceHeader,
} from '../../src/utils/bankInvoiceParsers';
import { normalizeInvoiceTransactions } from '../../src/utils/invoiceCompetenceEngine';

describe('Validação Multi-Banco em Modo Preview (Amostras Anonimizadas)', () => {
	const mockWorkspaceCards = [
		{ id: 'card-caixa-2583', name: 'Caixa Sim', last_four_digits: '2583', brand: 'Visa' },
		{ id: 'card-nu-6768', name: 'Nubank Roxinho', last_four_digits: '6768', brand: 'Mastercard' },
		{ id: 'card-inter-4321', name: 'Inter Gold', last_four_digits: '4321', brand: 'Mastercard' },
		{ id: 'card-itau-9876', name: 'Itaucard Visa', last_four_digits: '9876', brand: 'Visa' },
		{ id: 'card-brad-5544', name: 'Bradesco Elo', last_four_digits: '5544', brand: 'Elo' },
		{ id: 'card-sant-3322', name: 'Santander SX', last_four_digits: '3322', brand: 'Visa' },
		{ id: 'card-bb-7788', name: 'Ourocard Visa', last_four_digits: '7788', brand: 'Visa' },
		{ id: 'card-c6-9911', name: 'C6 Carbon', last_four_digits: '9911', brand: 'Mastercard' },
	];

	// 1. CAIXA ECONÔMICA FEDERAL (Validado com formato real)
	it('1. Caixa Econômica Federal - Fatura Real Anonimizada', () => {
		const caixaText = `
			CAIXA ECONOMICA FEDERAL
			Demonstrativo de Fatura de Cartão de Crédito
			Nome do Titular: TITULAR TESTE
			CPF: ***.***.***-**
			Vencimento: 10/09/2026
			Total a Pagar: R$ 112,79
			Pagamento Mínimo: R$ 16,91

			(Cartão 2583)
			06/06 NORMATEL HOME CENTER 03 DE 03 FORTALEZA 77,77D
			07/05 AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR 35,02D
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(caixaText, 'auto');
		expect(detectedBank).toBe('caixa');
		expect(rawTransactions).toHaveLength(2);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.anoFatura).toBe(2026);
		expect(normalized.mesFatura).toBe(9);
		expect(normalized.mesReferenciaFatura).toBe('2026-09');

		const totalSum = normalized.transactions.reduce((acc, t) => acc + t.amount, 0);
		expect(Number(totalSum.toFixed(2))).toBe(112.79);
		expect(normalized.transactions[0].creditCardId).toBe('card-caixa-2583');
		expect(normalized.transactions[0].date).toBe('2026-09-06');
		expect(normalized.transactions[0].description).toBe('NORMATEL HOME CENTER 03 DE 03 FORTALEZA');
	});

	// 2. NUBANK (Fatura PDF layout real anonimizado)
	it('2. Nubank - Fatura PDF Realista com Meses Abreviados e Parcelas', () => {
		const nubankText = `
			Nubank - Nu Pagamentos S.A.
			Olá, TITULAR TESTE
			Vencimento: 10 OUT 2026
			Total da Fatura: R$ 450,00

			Cartão final 6768
			15 JUL Restaurante Coco Bambu 02/05 R$ 220,00
			20 AGO Supermercado Pão de Açúcar R$ 130,00
			02 SET Farmácia Drogasil 100,00
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(nubankText, 'auto');
		expect(detectedBank).toBe('nubank');
		expect(rawTransactions).toHaveLength(3);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-10');
		expect(normalized.transactions[0].creditCardId).toBe('card-nu-6768');
		expect(normalized.transactions[0].date).toBe('2026-10-15');
		expect(normalized.transactions[0].installments).toBe(5);
		expect(normalized.transactions[0].installmentCurrent).toBe(2);

		const totalSum = normalized.transactions.reduce((acc, t) => acc + t.amount, 0);
		expect(totalSum).toBe(450.0);
	});

	// 3. BANCO INTER (Fatura PDF layout real anonimizado)
	it('3. Banco Inter - Fatura PDF Realista com Datas DD/MM/AAAA', () => {
		const interText = `
			Banco Inter S.A.
			Fatura Inter Mastercard
			Titular: TITULAR TESTE
			Vencimento: 05/11/2026
			Valor Total da Fatura: R$ 380,50

			Cartão Inter final 4321
			10/09/2026 Posto Shell Gasolina R$ 150,50
			18/09/2026 Netflix Assinatura 55,90
			25/09/2026 Leroy Merlin 01 DE 03 174,10
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(interText, 'auto');
		expect(detectedBank).toBe('inter');
		expect(rawTransactions).toHaveLength(3);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-11');
		expect(normalized.transactions[2].creditCardId).toBe('card-inter-4321');
		expect(normalized.transactions[2].installments).toBe(3);
		expect(normalized.transactions[2].installmentCurrent).toBe(1);

		const totalSum = normalized.transactions.reduce((acc, t) => acc + t.amount, 0);
		expect(Number(totalSum.toFixed(2))).toBe(380.5);
	});

	// 4. ITAÚ / ITAUCARD (Fatura PDF layout real anonimizado)
	it('4. Itaú / Itaucard - Fatura PDF Realista com Lançamentos e Parcelamentos', () => {
		const itauText = `
			Itaú Unibanco S.A.
			Itaucard Visa Platinum
			Titular: TITULAR TESTE
			Total da fatura: R$ 414,90
			Vencimento: 15/10/2026

			Cartão Final 9876
			05/09 Magazine Luiza 02/10 R$ 250,00
			12/09 Uber *Trip 45,00
			20/09 Smart Fit Mensalidade 119,90
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(itauText, 'auto');
		expect(detectedBank).toBe('itau');
		expect(rawTransactions).toHaveLength(3);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-10');
		expect(normalized.transactions[0].creditCardId).toBe('card-itau-9876');
		expect(normalized.transactions[0].installments).toBe(10);
		expect(normalized.transactions[0].installmentCurrent).toBe(2);

		const totalSum = normalized.transactions.reduce((acc, t) => acc + t.amount, 0);
		expect(Number(totalSum.toFixed(2))).toBe(414.9);
	});

	// 5. BRADESCO (Fatura PDF layout real anonimizado com Débitos e Estornos/Créditos)
	it('5. Bradesco - Fatura PDF Realista com Débito (D) e Estorno (C)', () => {
		const bradescoText = `
			Bradesco Cartões
			Demonstrativo de Fatura
			Titular: TITULAR TESTE
			Vencimento: 20/09/2026
			Total a Pagar: R$ 180,40

			Cartão final 5544
			01/08 Carrefour Hipermercado 230,40 D
			10/08 Estorno Compra Cancelada 50,00 C
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(bradescoText, 'auto');
		expect(detectedBank).toBe('bradesco');
		expect(rawTransactions).toHaveLength(2);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-09');
		expect(normalized.transactions[0].type).toBe('expense');
		expect(normalized.transactions[1].type).toBe('income');
		expect(normalized.transactions[0].creditCardId).toBe('card-brad-5544');
	});

	// 6. SANTANDER (Fatura PDF layout real anonimizado)
	it('6. Santander - Fatura PDF Santander Way Realista', () => {
		const santanderText = `
			Banco Santander (Brasil) S.A.
			Santander Way
			Titular: TITULAR TESTE
			Vencimento: 12/09/2026
			Total da fatura: R$ 233,90

			Cartão SX final 3322
			15/08 Drogasil Farmacia 88,90
			22/08 Mercado Livre 03 DE 06 145,00
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(santanderText, 'auto');
		expect(detectedBank).toBe('santander');
		expect(rawTransactions).toHaveLength(2);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-09');
		expect(normalized.transactions[1].creditCardId).toBe('card-sant-3322');
		expect(normalized.transactions[1].installments).toBe(6);
		expect(normalized.transactions[1].installmentCurrent).toBe(3);

		const totalSum = normalized.transactions.reduce((acc, t) => acc + t.amount, 0);
		expect(Number(totalSum.toFixed(2))).toBe(233.9);
	});

	// 7. BANCO DO BRASIL (Ourocard PDF layout real anonimizado)
	it('7. Banco do Brasil - Fatura Ourocard Realista com Datas com Ponto', () => {
		const bbText = `
			Banco do Brasil
			Ourocard Elo Nanquim
			Cliente: TITULAR TESTE
			Vencimento: 28/09/2026
			Total: R$ 204,90

			Ourocard final 7788
			05.08 Amazon Prime 19,90
			14.08 Restaurante Outback 185,00
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(bbText, 'auto');
		expect(detectedBank).toBe('bb');
		expect(rawTransactions).toHaveLength(2);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-09');
		expect(normalized.transactions[0].creditCardId).toBe('card-bb-7788');
		expect(normalized.transactions[0].amount).toBe(19.9);

		const totalSum = normalized.transactions.reduce((acc, t) => acc + t.amount, 0);
		expect(Number(totalSum.toFixed(2))).toBe(204.9);
	});

	// 8. C6 BANK (Fatura C6 Carbon layout real anonimizado)
	it('8. C6 Bank - Fatura C6 Carbon Realista', () => {
		const c6Text = `
			C6 Bank - Banco C6 S.A.
			Fatura C6 Carbon Mastercard
			Titular: TITULAR TESTE
			Vencimento: 10/11/2026
			Total da fatura: R$ 106,90

			Cartão final 9911
			02/10 Apple Services R$ 34,90
			15/10 Ifood *Restaurante 72,00
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(c6Text, 'auto');
		expect(detectedBank).toBe('c6');
		expect(rawTransactions).toHaveLength(2);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-11');
		expect(normalized.transactions[0].creditCardId).toBe('card-c6-9911');

		const totalSum = normalized.transactions.reduce((acc, t) => acc + t.amount, 0);
		expect(Number(totalSum.toFixed(2))).toBe(106.9);
	});

	// 9. EXTRATO GENÉRICO (Fallback universal com auto-detecção)
	it('9. Extrato Genérico - Fallback Universal de Lançamentos Financeiros', () => {
		const genericText = `
			Demonstrativo Mensal de Despesas
			Referência: 08/2026

			01/08 Pagamento Conta de Luz 140,00
			15/08 Pix Recebido de Cliente 500,00 C
		`;

		const { header, rawTransactions, detectedBank } = parseInvoiceByBank(genericText, 'auto');
		expect(detectedBank).toBe('generic');
		expect(rawTransactions).toHaveLength(2);

		const normalized = normalizeInvoiceTransactions(rawTransactions, header, mockWorkspaceCards);
		expect(normalized.mesReferenciaFatura).toBe('2026-08');
		expect(normalized.transactions[0].amount).toBe(140);
		expect(normalized.transactions[1].type).toBe('income');
	});
});
