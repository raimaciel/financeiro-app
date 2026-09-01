import { describe, it, expect } from 'vitest';
import { parseOFX, parseOfxDate } from '../../src/utils/ofxParser';

describe('parseOfxDate', () => {
	it('deve converter YYYYMMDDHHMMSS para YYYY-MM-DD', () => {
		expect(parseOfxDate('20260815120000[-03:EST]')).toBe('2026-08-15');
		expect(parseOfxDate('20260815120000')).toBe('2026-08-15');
		expect(parseOfxDate('20260815')).toBe('2026-08-15');
	});

	it('deve manter data que já está em YYYY-MM-DD', () => {
		expect(parseOfxDate('2026-08-15')).toBe('2026-08-15');
	});

	it('deve converter DD/MM/YYYY para YYYY-MM-DD', () => {
		expect(parseOfxDate('15/08/2026')).toBe('2026-08-15');
	});
});

describe('parseOFX', () => {
	const sampleOfx = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKTRANLIST>
<DTSTART>20260801000000
<DTEND>20260831000000

<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260810120000[-03:EST]
<TRNAMT>-150.50
<FITID>20260810001
<MEMO>Supermercado Pao &amp; Acucar
</STMTTRN>

<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260815120000[-03:EST]
<TRNAMT>3500.00
<FITID>20260815002
<NAME>Transferencia Pix Recebida - Salario
</STMTTRN>

<STMTTRN>
<TRNTYPE>PAYMENT
<DTPOSTED>20260820000000
<TRNAMT>-89.90
<FITID>20260820003
<MEMO>Uber *Trip 02/05
</STMTTRN>

</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

	it('deve extrair todas as transações do OFX com dados formatados', () => {
		const result = parseOFX(sampleOfx);

		expect(result).toHaveLength(3);

		// Transação 1 (Débito / Despesa)
		expect(result[0].date).toBe('2026-08-10');
		expect(result[0].description).toBe('Supermercado Pao & Acucar');
		expect(result[0].amount).toBe(150.5);
		expect(result[0].rawAmount).toBe(-150.5);
		expect(result[0].type).toBe('expense');
		expect(result[0].fitid).toBe('20260810001');

		// Transação 2 (Crédito / Receita)
		expect(result[1].date).toBe('2026-08-15');
		expect(result[1].description).toBe('Transferencia Pix Recebida - Salario');
		expect(result[1].amount).toBe(3500.0);
		expect(result[1].rawAmount).toBe(3500.0);
		expect(result[1].type).toBe('income');
		expect(result[1].fitid).toBe('20260815002');

		// Transação 3 (Pagamento / Despesa)
		expect(result[2].date).toBe('2026-08-20');
		expect(result[2].description).toBe('Uber *Trip 02/05');
		expect(result[2].amount).toBe(89.9);
		expect(result[2].type).toBe('expense');
	});

	it('deve retornar array vazio para arquivo inválido ou vazio', () => {
		expect(parseOFX('')).toEqual([]);
		expect(parseOFX('texto qualquer sem tags ofx')).toEqual([]);
	});
});
