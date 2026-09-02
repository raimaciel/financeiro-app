import { describe, it, expect } from 'vitest';
import { extractTransactions } from '../../src/utils/caixaInvoiceParser';

describe('Caixa Invoice Parser (extractTransactions)', () => {
	it('deve extrair transações no padrão DD/MM DESCRIÇÃO VALOR(D|C) sem inferir o ano', () => {
		const sampleText = `
			CAIXA ECONOMICA FEDERAL
			Nome do Titular: CARLOS SILVA
			CPF: 123.456.789-00
			Endereço: RUA DAS PALMEIRAS, 100
			Limite de Crédito: R$ 15.000,00
			Vencimento: 10/04/2026

			(Cartão 1234)
			05/03 SUPERMERCADO ABC 154,30D
			12/03 UBER *TRIP 25,90D
			15/03 ESTORNO COMPRA 80,00C
			Total do Cartão 1234 260,20D

			(Cartão 5678)
			18/03 FARMACIA DROGASIL 94,50D
			22/03 AMAZON.COM.BR 1.234,56D
			Total dos Lançamentos 1.329,06D
			Total a Pagar 1.589,26D
		`;

		const result = extractTransactions(sampleText);

		expect(result).toHaveLength(5);

		// Transação 1
		expect(result[0]).toMatchObject({
			dataParcial: '05/03',
			descricao: 'SUPERMERCADO ABC',
			valor: 154.3,
			tipo: 'D',
			cartao: 'Cartão 1234',
			precisaRevisao: true,
		});

		// Transação 2
		expect(result[1]).toMatchObject({
			dataParcial: '12/03',
			descricao: 'UBER *TRIP',
			valor: 25.9,
			tipo: 'D',
			cartao: 'Cartão 1234',
			precisaRevisao: true,
		});

		// Transação 3 (Crédito / Estorno)
		expect(result[2]).toMatchObject({
			dataParcial: '15/03',
			descricao: 'ESTORNO COMPRA',
			valor: 80.0,
			tipo: 'C',
			cartao: 'Cartão 1234',
			precisaRevisao: true,
		});

		// Transação 4 (Segundo Cartão)
		expect(result[3]).toMatchObject({
			dataParcial: '18/03',
			descricao: 'FARMACIA DROGASIL',
			valor: 94.5,
			tipo: 'D',
			cartao: 'Cartão 5678',
			precisaRevisao: true,
		});

		// Transação 5 (Valor com milhar)
		expect(result[4]).toMatchObject({
			dataParcial: '22/03',
			descricao: 'AMAZON.COM.BR',
			valor: 1234.56,
			tipo: 'D',
			cartao: 'Cartão 5678',
			precisaRevisao: true,
		});
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
