import { describe, it, expect } from 'vitest';
import { detectInstallment } from '../../src/utils/installmentDetector';

describe('detectInstallment', () => {
	it('deve identificar parcelamento no formato "02/06"', () => {
		const res = detectInstallment('LOJAS RENNER 02/06');
		expect(res.hasInstallment).toBe(true);
		expect(res.installmentCurrent).toBe(2);
		expect(res.installmentTotal).toBe(6);
		expect(res.cleanDescription).toBe('LOJAS RENNER');
	});

	it('deve identificar parcelamento no formato "PARC 03/10"', () => {
		const res = detectInstallment('MAGALU PARC 03/10');
		expect(res.hasInstallment).toBe(true);
		expect(res.installmentCurrent).toBe(3);
		expect(res.installmentTotal).toBe(10);
		expect(res.cleanDescription).toBe('MAGALU');
	});

	it('deve identificar parcelamento entre parênteses "(2/5)"', () => {
		const res = detectInstallment('AMAZON (2/5)');
		expect(res.hasInstallment).toBe(true);
		expect(res.installmentCurrent).toBe(2);
		expect(res.installmentTotal).toBe(5);
		expect(res.cleanDescription).toBe('AMAZON');
	});

	it('deve identificar formato "PARCELA 04 DE 12"', () => {
		const res = detectInstallment('CASAS BAHIA PARCELA 04 DE 12');
		expect(res.hasInstallment).toBe(true);
		expect(res.installmentCurrent).toBe(4);
		expect(res.installmentTotal).toBe(12);
		expect(res.cleanDescription).toBe('CASAS BAHIA');
	});

	it('deve ignorar textos comuns sem parcelamento', () => {
		const res = detectInstallment('SUPERMERCADO PAO DE ACUCAR');
		expect(res.hasInstallment).toBe(false);
		expect(res.installmentCurrent).toBeNull();
		expect(res.installmentTotal).toBeNull();
	});
});
