import { describe, it, expect } from 'vitest';
import { extractTransactions, detectInvoiceReference } from '../../src/utils/caixaInvoiceParser';

describe('Caixa Invoice Parser (extractTransactions & detectInvoiceReference)', () => {
	it('deve extrair transações preservando 100% da descrição sem truncar parcelas ou cidades (Bug 1)', () => {
		const sampleText = `
			CAIXA ECONOMICA FEDERAL
			Vencimento: 10/09/2026

			(Cartão 2583)
			06/06 NORMATEL HOME CENTER 03 DE 03 FORTALEZA 150,00D
			07/05 AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR 89,90D
		`;

		const result = extractTransactions(sampleText);

		expect(result).toHaveLength(2);

		// Transação 1: Descrição completa preservada
		expect(result[0].descricao).toBe('NORMATEL HOME CENTER 03 DE 03 FORTALEZA');
		expect(result[0].valor).toBe(150.0);
		expect(result[0].tipo).toBe('D');
		expect(result[0].cartao).toBe('Cartão 2583');
		expect(result[0].cartaoDigitos).toBe('2583');

		// Transação 2: Descrição completa preservada
		expect(result[1].descricao).toBe('AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR');
		expect(result[1].valor).toBe(89.9);
		expect(result[1].tipo).toBe('D');
		expect(result[1].cartaoDigitos).toBe('2583');
	});

	it('deve extrair a competência da fatura e associar dataCompetencia à transação (Bug 2)', () => {
		const sampleText = `
			CAIXA ECONOMICA FEDERAL
			Demonstrativo da Fatura
			Vencimento: 15/09/2026
			Total a Pagar: R$ 450,00

			(Cartão 2424)
			06/06 COMPRA PARCELADA LOJA 03 DE 03 150,00D
		`;

		const ref = detectInvoiceReference(sampleText);
		expect(ref).toMatchObject({
			mesReferencia: '2026-09',
			ano: 2026,
			mes: 9,
			dataVencimento: '2026-09-15',
		});

		const result = extractTransactions(sampleText);
		expect(result).toHaveLength(1);
		// Data original da compra é 06/06
		expect(result[0].dataTransacao).toBe('06/06');
		// Mas a data de competência da fatura é Setembro/2026
		expect(result[0].dataCompetencia).toBe('2026-09-06');
		expect(result[0].anoFatura).toBe(2026);
		expect(result[0].mesFatura).toBe(9);
	});

	it('deve extrair os 4 últimos dígitos do cartão para vinculação automática (Bug 3)', () => {
		const sampleText = `
			(Cartão 2583)
			10/08 IFOOD *REFEICAO 45,00D

			(Cartão 2424)
			12/08 UBER *TRIP 22,50D
		`;

		const result = extractTransactions(sampleText);
		expect(result).toHaveLength(2);
		expect(result[0].cartaoDigitos).toBe('2583');
		expect(result[1].cartaoDigitos).toBe('2424');
	});

	it('deve ignorar linhas de dados pessoais, totalizadores e resumos', () => {
		const sampleText = `
			Nome: MARIA OLIVEIRA
			CPF: 987.654.321-11
			Limite Disponível: 5.000,00
			Saldo Anterior: 1.200,00
			Subtotal: 300,00
			Total da Fatura: 1.500,00
			01/04 LOJA DE ROUPAS 120,00D
		`;

		const result = extractTransactions(sampleText);
		expect(result).toHaveLength(1);
		expect(result[0].descricao).toBe('LOJA DE ROUPAS');
		expect(result[0].valor).toBe(120);
		expect(result[0].dataParcial).toBe('01/04');
	});

	it('deve retornar array vazio se o texto não contiver transações válidas', () => {
		const text = 'Apenas cabeçalhos e texto sem formato de lançamentos.';
		expect(extractTransactions(text)).toEqual([]);
	});
});
