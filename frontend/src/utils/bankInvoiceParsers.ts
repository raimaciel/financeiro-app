/**
 * Módulo de Parsers de Faturas e Extratos Multi-Banco (Camada 1).
 * 
 * Suporte a:
 * - Auto-Detecção Inteligente
 * - Caixa Econômica Federal (caixa)
 * - Nubank (nubank)
 * - Banco Inter (inter)
 * - Itaú (itau)
 * - Bradesco (bradesco)
 * - Santander (santander)
 * - Banco do Brasil (bb)
 * - C6 Bank (c6)
 * - Extrato / Fatura Genérica (generic)
 * 
 * Todos os parsers retornam RawExtractedTransaction[] e RawInvoiceHeader,
 * que são processados pela Camada 2 (invoiceCompetenceEngine).
 */

import type { RawExtractedTransaction, RawInvoiceHeader, NormalizedImportTransaction } from './invoiceCompetenceEngine';
import { normalizeInvoiceTransactions } from './invoiceCompetenceEngine';
import { extractRawTransactions as extractCaixaRaw, extractInvoiceHeader as extractCaixaHeader } from './caixaInvoiceParser';

const MONTH_NAMES_MAP: Record<string, number> = {
	janeiro: 1, jan: 1,
	fevereiro: 2, fev: 2, feb: 2,
	março: 3, marco: 3, mar: 3,
	abril: 4, abr: 4, apr: 4,
	maio: 5, mai: 5, may: 5,
	junho: 6, jun: 6,
	julho: 7, jul: 7,
	agosto: 8, ago: 8, aug: 8,
	setembro: 9, set: 9, sep: 9,
	outubro: 10, out: 10, oct: 10,
	novembro: 11, nov: 11,
	dezembro: 12, dez: 12, dec: 12,
};

const IGNORED_LINE_PATTERNS = [
	/^Total\b/i,
	/^Subtotal\b/i,
	/^Saldo\b/i,
	/^Nome(?:\s+do\s+Titular)?[:\s]/i,
	/^CPF[:\s]/i,
	/^Endere[cç]o[:\s]/i,
	/^Limite(?:\s+de\s+Cr[eé]dito|\s+Total|\s+Dispon[ií]vel|\s+Utilizado)?[:\s]/i,
	/^Vencimento[:\s]/i,
	/^Demonstrativo\b/i,
	/^Resumo\b/i,
	/^Pagamento\s+M[ií]nimo/i,
	/^Autentica[cç][aã]o/i,
	/^Central\s+de\s+Atendimento/i,
	/^SAC\b/i,
	/^Ouvidoria\b/i,
	/^Data\s+Descri[cç][aã]o/i,
	/^Lançamentos\s+da\s+Conta/i,
	/^Encargos\b/i,
	/^Taxas\b/i,
	/^Melhor\s+data\s+para\s+compra/i,
	/^Emiss[aã]o[:\s]/i,
	/^Fatura\s+fechada/i,
	/^Pague\s+at[eé]/i,
	/^Linha\s+digit[aá]vel/i,
];

const INSTALLMENT_REGEX = /(?:PARC(?:ELA)?\.?\s*|\s+|\()(\d{1,2})\s*(?:\/|\s+DE\s+)\s*(\d{1,2})\)?/i;

/**
 * Detecta automaticamente o banco pelo conteúdo do texto da fatura/extrato.
 */
export function detectBankFromText(text: string): string {
	if (!text || typeof text !== 'string') return 'generic';

	const lower = text.toLowerCase();

	if (lower.includes('caixa econ') || lower.includes('(cartão ') || lower.includes('(cartao ')) {
		return 'caixa';
	}
	if (lower.includes('nubank') || lower.includes('nu pagamentos') || lower.includes('nu finance') || lower.includes('roxinho')) {
		return 'nubank';
	}
	if (lower.includes('banco inter') || lower.includes('inter dtvm') || lower.includes('intermedium')) {
		return 'inter';
	}
	if (lower.includes('itau') || lower.includes('itaucard') || lower.includes('personnalite') || lower.includes('uniclass')) {
		return 'itau';
	}
	if (lower.includes('bradesco') || lower.includes('bradescard') || lower.includes('banco next')) {
		return 'bradesco';
	}
	if (lower.includes('santander') || lower.includes('santander way') || lower.includes('cartão sx')) {
		return 'santander';
	}
	if (lower.includes('banco do brasil') || lower.includes('ourocard') || lower.includes('bb s.a.')) {
		return 'bb';
	}
	if (lower.includes('c6 bank') || lower.includes('banco c6') || lower.includes('c6 carbon')) {
		return 'c6';
	}

	return 'generic';
}

/**
 * Extrai o cabeçalho de fatura de forma genérica/multi-banco.
 */
export function extractGenericInvoiceHeader(text: string, defaultBank: string = 'generic'): RawInvoiceHeader {
	if (!text || typeof text !== 'string') {
		return { sourceBank: defaultBank };
	}

	const lines = text.split(/\r?\n/).slice(0, 50).map((l) => l.trim()).filter(Boolean);

	// 1. Vencimento: DD/MM/AAAA
	const vencimentoRegex = /(?:vencimento|pagar\s+at[eé]|vence\s+em|data\s+de\s+vencimento)[\s\-:]+(\d{2})\/(\d{2})\/(\d{4})/i;
	for (const line of lines) {
		const match = line.match(vencimentoRegex);
		if (match) {
			const day = match[1];
			const month = parseInt(match[2], 10);
			const year = parseInt(match[3], 10);
			if (month >= 1 && month <= 12 && year >= 1970 && year <= 2100) {
				return {
					invoiceReferenceMonth: `${year}-${String(month).padStart(2, '0')}`,
					invoiceYear: year,
					invoiceMonth: month,
					invoiceDueDate: `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`,
					sourceBank: defaultBank,
				};
			}
		}
	}

	// 2. Vencimento com nome de mês (ex: 10 OUT 2026, 10 de Outubro de 2026)
	const vencimentoNomeRegex = /(?:vencimento|vence\s+em)[\s\-:]+(\d{1,2})\s+(?:de\s+)?([a-zA-ZçÇ]{3,9})\s+(?:de\s+)?(\d{4})/i;
	for (const line of lines) {
		const match = line.match(vencimentoNomeRegex);
		if (match) {
			const day = match[1].padStart(2, '0');
			const monthName = match[2].toLowerCase().replace('.', '');
			const monthNum = MONTH_NAMES_MAP[monthName];
			const year = parseInt(match[3], 10);
			if (monthNum && year >= 1970 && year <= 2100) {
				return {
					invoiceReferenceMonth: `${year}-${String(monthNum).padStart(2, '0')}`,
					invoiceYear: year,
					invoiceMonth: monthNum,
					invoiceDueDate: `${year}-${String(monthNum).padStart(2, '0')}-${day}`,
					sourceBank: defaultBank,
				};
			}
		}
	}

	// 3. Fatura [Mês] [Ano] (ex: Fatura Outubro 2026)
	const faturaNomeMesRegex = /(?:fatura|demonstrativo|refer[eê]ncia)[\s\-:]+(?:de\s+)?([a-zA-ZçÇ]{3,9})\b(?:\s+(?:de\s+)?(\d{4}))?/i;
	for (const line of lines) {
		const match = line.match(faturaNomeMesRegex);
		if (match) {
			const monthName = match[1].toLowerCase().replace('.', '');
			const monthNum = MONTH_NAMES_MAP[monthName];
			const year = match[2] ? parseInt(match[2], 10) : new Date().getFullYear();
			if (monthNum) {
				return {
					invoiceReferenceMonth: `${year}-${String(monthNum).padStart(2, '0')}`,
					invoiceYear: year,
					invoiceMonth: monthNum,
					sourceBank: defaultBank,
				};
			}
		}
	}

	// 4. Fatura MM/AAAA
	const faturaNumMesRegex = /(?:fatura|demonstrativo|refer[eê]ncia)[\s\-:]+(\d{2})\/(\d{4})/i;
	for (const line of lines) {
		const match = line.match(faturaNumMesRegex);
		if (match) {
			const month = parseInt(match[1], 10);
			const year = parseInt(match[2], 10);
			if (month >= 1 && month <= 12) {
				return {
					invoiceReferenceMonth: `${year}-${String(month).padStart(2, '0')}`,
					invoiceYear: year,
					invoiceMonth: month,
					sourceBank: defaultBank,
				};
			}
		}
	}

	return { sourceBank: defaultBank };
}

/**
 * Parser de Fatura Nubank (Camada 1).
 * Layout típico: "15 JUL Restaurante Coco Bambu R$ 220,00" ou "15/07 Mercado 45,00"
 */
export function extractNubankRaw(text: string): RawExtractedTransaction[] {
	if (!text) return [];
	const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const rawTransactions: RawExtractedTransaction[] = [];

	let currentCardDigits: string | null = null;

	for (const line of lines) {
		const cardMatch = line.match(/(?:cart[aã]o|final)[\s:]*(\d{4})/i);
		if (cardMatch) {
			currentCardDigits = cardMatch[1];
		}

		if (IGNORED_LINE_PATTERNS.some((rx) => rx.test(line))) continue;

		// Padrão 1: "15 JUL Estabelecimento R$ 120,50" ou "15 JUL Estabelecimento 120,50"
		const nubankTextRegex = /^(\d{1,2})\s+([a-zA-ZçÇ]{3})\s+(.+?)\s+(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})$/i;
		const match1 = line.match(nubankTextRegex);
		if (match1) {
			const day = match1[1].padStart(2, '0');
			const monthName = match1[2].toLowerCase();
			const monthNum = MONTH_NAMES_MAP[monthName];
			const monthStr = monthNum ? String(monthNum).padStart(2, '0') : '01';
			const originalDate = `${day}/${monthStr}`;
			const description = match1[3].trim();
			const amount = parseFloat(match1[4].replace(/\./g, '').replace(',', '.'));

			if (!isNaN(amount) && amount > 0) {
				let installmentInfo: { current: number; total: number } | null = null;
				const instMatch = description.match(INSTALLMENT_REGEX);
				if (instMatch) {
					installmentInfo = { current: parseInt(instMatch[1], 10), total: parseInt(instMatch[2], 10) };
				}

				rawTransactions.push({
					description,
					amount,
					type: 'D',
					originalDate,
					cardLastDigits: currentCardDigits,
					installmentInfo,
					sourceBank: 'nubank',
				});
				continue;
			}
		}

		// Padrão 2: "15/07 Estabelecimento 120,50"
		const standardRegex = /^(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*([DCdc])?$/;
		const match2 = line.match(standardRegex);
		if (match2) {
			const rawDate = match2[1];
			const description = match2[2].trim();
			const amount = parseFloat(match2[3].replace(/\./g, '').replace(',', '.'));
			const rawType = (match2[4] || 'D').toUpperCase();

			if (!isNaN(amount) && amount > 0) {
				let installmentInfo: { current: number; total: number } | null = null;
				const instMatch = description.match(INSTALLMENT_REGEX);
				if (instMatch) {
					installmentInfo = { current: parseInt(instMatch[1], 10), total: parseInt(instMatch[2], 10) };
				}

				rawTransactions.push({
					description,
					amount,
					type: rawType === 'C' ? 'C' : 'D',
					originalDate: rawDate.slice(0, 5),
					cardLastDigits: currentCardDigits,
					installmentInfo,
					sourceBank: 'nubank',
				});
			}
		}
	}

	return rawTransactions;
}

/**
 * Parser Genérico / Universal para Faturas de Cartão (Itaú, Bradesco, Santander, Inter, BB, C6 e Genérico).
 * Extrai qualquer padrão reconhecível de lançamentos com data, descrição e valor.
 */
export function extractGenericRaw(text: string, bankCode: string = 'generic'): RawExtractedTransaction[] {
	if (!text) return [];
	const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const rawTransactions: RawExtractedTransaction[] = [];

	let currentCardDigits: string | null = null;
	let currentCardLabel: string | undefined = undefined;

	for (const line of lines) {
		const cardMatch = line.match(/(?:cart[aã]o|final|ourocard|itaucard|visa|mastercard|elo)[\s:\-]*(\d{4})/i);
		if (cardMatch) {
			currentCardDigits = cardMatch[1];
			currentCardLabel = `Cartão final ${currentCardDigits}`;
		}

		if (IGNORED_LINE_PATTERNS.some((rx) => rx.test(line))) continue;

		// Formato 1: DD/MM ou DD/MM/AAAA Descrição R$ Valor (D/C)
		const rx1 = /^(\d{2}[\/\.]\d{2}(?:[\/\.]\d{2,4})?)\s+(.+?)\s+(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*([DCdc])?$/;
		const match1 = line.match(rx1);
		if (match1) {
			const originalDate = match1[1].replace(/\./g, '/').slice(0, 5);
			const description = match1[2].trim();
			const amount = parseFloat(match1[3].replace(/\./g, '').replace(',', '.'));
			const rawType = (match1[4] || 'D').toUpperCase();

			if (!isNaN(amount) && amount > 0) {
				let installmentInfo: { current: number; total: number } | null = null;
				const instMatch = description.match(INSTALLMENT_REGEX);
				if (instMatch) {
					installmentInfo = { current: parseInt(instMatch[1], 10), total: parseInt(instMatch[2], 10) };
				}

				rawTransactions.push({
					description,
					amount,
					type: rawType === 'C' ? 'C' : 'D',
					originalDate,
					cardLastDigits: currentCardDigits,
					cardLabel: currentCardLabel,
					installmentInfo,
					sourceBank: bankCode,
				});
				continue;
			}
		}

		// Formato 2: DD MMM Descrição Valor
		const rx2 = /^(\d{1,2})\s+([a-zA-ZçÇ]{3})\s+(.+?)\s+(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})$/i;
		const match2 = line.match(rx2);
		if (match2) {
			const day = match2[1].padStart(2, '0');
			const monthName = match2[2].toLowerCase();
			const monthNum = MONTH_NAMES_MAP[monthName];
			const monthStr = monthNum ? String(monthNum).padStart(2, '0') : '01';
			const originalDate = `${day}/${monthStr}`;
			const description = match2[3].trim();
			const amount = parseFloat(match2[4].replace(/\./g, '').replace(',', '.'));

			if (!isNaN(amount) && amount > 0) {
				let installmentInfo: { current: number; total: number } | null = null;
				const instMatch = description.match(INSTALLMENT_REGEX);
				if (instMatch) {
					installmentInfo = { current: parseInt(instMatch[1], 10), total: parseInt(instMatch[2], 10) };
				}

				rawTransactions.push({
					description,
					amount,
					type: 'D',
					originalDate,
					cardLastDigits: currentCardDigits,
					cardLabel: currentCardLabel,
					installmentInfo,
					sourceBank: bankCode,
				});
			}
		}
	}

	return rawTransactions;
}

/**
 * Dispatcher Central: Processa qualquer fatura ou extrato de qualquer banco.
 */
export function parseInvoiceByBank(
	text: string,
	selectedBank: string = 'auto'
): {
	header: RawInvoiceHeader;
	rawTransactions: RawExtractedTransaction[];
	detectedBank: string;
} {
	const detectedBank = selectedBank === 'auto' ? detectBankFromText(text) : selectedBank;

	let header: RawInvoiceHeader;
	let rawTransactions: RawExtractedTransaction[] = [];

	switch (detectedBank) {
		case 'caixa':
			header = extractCaixaHeader(text);
			rawTransactions = extractCaixaRaw(text);
			break;
		case 'nubank':
			header = extractGenericInvoiceHeader(text, 'nubank');
			rawTransactions = extractNubankRaw(text);
			if (rawTransactions.length === 0) {
				rawTransactions = extractGenericRaw(text, 'nubank');
			}
			break;
		case 'inter':
		case 'itau':
		case 'bradesco':
		case 'santander':
		case 'bb':
		case 'c6':
		case 'generic':
		default:
			header = extractGenericInvoiceHeader(text, detectedBank);
			rawTransactions = extractGenericRaw(text, detectedBank);
			break;
	}

	return {
		header,
		rawTransactions,
		detectedBank,
	};
}
