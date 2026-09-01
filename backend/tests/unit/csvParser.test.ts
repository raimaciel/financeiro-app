import { describe, it, expect } from 'vitest';
import { parseCSV, parseCsvDate, parseCsvAmount, detectDelimiter } from '../../src/utils/csvParser';

describe('detectDelimiter', () => {
	it('deve identificar ponto e vírgula', () => {
		expect(detectDelimiter('Data;Valor;Descricao\n15/08/2026;100;Teste')).toBe(';');
	});

	it('deve identificar vírgula', () => {
		expect(detectDelimiter('date,amount,description\n2026-08-15,100,Teste')).toBe(',');
	});

	it('deve identificar tabulação', () => {
		expect(detectDelimiter('Data\tValor\tDescricao\n15/08/2026\t100\tTeste')).toBe('\t');
	});
});

describe('parseCsvDate', () => {
	it('deve reconhecer YYYY-MM-DD', () => {
		expect(parseCsvDate('2026-08-15')).toBe('2026-08-15');
	});

	it('deve reconhecer DD/MM/YYYY', () => {
		expect(parseCsvDate('15/08/2026')).toBe('2026-08-15');
	});

	it('deve reconhecer DD-MM-YYYY', () => {
		expect(parseCsvDate('05-02-2026')).toBe('2026-02-05');
	});

	it('deve retornar null para texto inválido', () => {
		expect(parseCsvDate('invalido')).toBeNull();
	});
});

describe('parseCsvAmount', () => {
	it('deve converter formato brasileiro (1.234,56 -> 1234.56)', () => {
		const res = parseCsvAmount('1.234,56');
		expect(res?.amount).toBe(1234.56);
		expect(res?.rawAmount).toBe(1234.56);
		expect(res?.isNegative).toBe(false);
	});

	it('deve converter valor negativo com sinal (-150,50 -> 150.50 negativo)', () => {
		const res = parseCsvAmount('-150,50');
		expect(res?.amount).toBe(150.5);
		expect(res?.rawAmount).toBe(-150.5);
		expect(res?.isNegative).toBe(true);
	});

	it('deve converter formato contábil entre parênteses ((89,90) -> negativo)', () => {
		const res = parseCsvAmount('(89,90)');
		expect(res?.amount).toBe(89.9);
		expect(res?.rawAmount).toBe(-89.9);
		expect(res?.isNegative).toBe(true);
	});

	it('deve suportar prefixo R$', () => {
		const res = parseCsvAmount('R$ -45,00');
		expect(res?.amount).toBe(45);
		expect(res?.isNegative).toBe(true);
	});
});

describe('parseCSV', () => {
	it('deve fazer parse de CSV estilo Nubank (vírgula)', () => {
		const nubankCsv = `Data,Valor,Identificador,Descrição
2026-08-15,-150.50,nubank-001,Supermercado Extra
2026-08-16,3500.00,nubank-002,Transferencia Pix Recebida`;

		const result = parseCSV(nubankCsv, 'nubank');
		expect(result).toHaveLength(2);

		expect(result[0].date).toBe('2026-08-15');
		expect(result[0].description).toBe('Supermercado Extra');
		expect(result[0].amount).toBe(150.5);
		expect(result[0].type).toBe('expense');

		expect(result[1].date).toBe('2026-08-16');
		expect(result[1].description).toBe('Transferencia Pix Recebida');
		expect(result[1].amount).toBe(3500);
		expect(result[1].type).toBe('income');
	});

	it('deve fazer parse de CSV estilo Inter/Itaú (ponto e vírgula com números BR)', () => {
		const interCsv = `Data Lançamento;Histórico;Descrição;Valor;Saldo
10/08/2026;COMPRA CARTAO;Restaurante Outback;-120,00;1.500,00
12/08/2026;PIX RECEBIDO;Reembolso Viagem;80,50;1.580,50`;

		const result = parseCSV(interCsv, 'inter');
		expect(result).toHaveLength(2);

		expect(result[0].date).toBe('2026-08-10');
		expect(result[0].description).toBe('Restaurante Outback');
		expect(result[0].amount).toBe(120);
		expect(result[0].type).toBe('expense');

		expect(result[1].date).toBe('2026-08-12');
		expect(result[1].description).toBe('Reembolso Viagem');
		expect(result[1].amount).toBe(80.5);
		expect(result[1].type).toBe('income');
	});

	it('deve fazer parse de CSV estilo Bradesco com colunas separadas de crédito e débito', () => {
		const bradescoCsv = `Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)
05/08/2026;PAGAMENTO CONTA ENEL;;;185,40;800,00
08/08/2026;DEPOSITO DINHEIRO;;500,00;;1.300,00`;

		const result = parseCSV(bradescoCsv, 'bradesco');
		expect(result).toHaveLength(2);

		expect(result[0].date).toBe('2026-08-05');
		expect(result[0].description).toBe('PAGAMENTO CONTA ENEL');
		expect(result[0].amount).toBe(185.4);
		expect(result[0].type).toBe('expense');

		expect(result[1].date).toBe('2026-08-08');
		expect(result[1].description).toBe('DEPOSITO DINHEIRO');
		expect(result[1].amount).toBe(500);
		expect(result[1].type).toBe('income');
	});
});
