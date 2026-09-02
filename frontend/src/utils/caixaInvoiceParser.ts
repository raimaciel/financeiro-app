import type { RawExtractedTransaction, RawInvoiceHeader, NormalizedImportTransaction } from './invoiceCompetenceEngine';
import { normalizeInvoiceTransactions } from './invoiceCompetenceEngine';

export { type RawExtractedTransaction, type RawInvoiceHeader, type NormalizedImportTransaction };

const MONTH_NAMES_MAP: Record<string, number> = {
	janeiro: 1,
	jan: 1,
	fevereiro: 2,
	fev: 2,
	março: 3,
	marco: 3,
	mar: 3,
	abril: 4,
	abr: 4,
	maio: 5,
	mai: 5,
	junho: 6,
	jun: 6,
	julho: 7,
	jul: 7,
	agosto: 8,
	ago: 8,
	setembro: 9,
	set: 9,
	outubro: 10,
	out: 10,
	novembro: 11,
	nov: 11,
	dezembro: 12,
	dez: 12,
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
];

const CARD_HEADER_REGEX = /(?:\(?\s*Cart[aã]o(?:\s*[:\-])?\s+(?:[\w\*]+\s+)*(\d{4}|\d+)\s*\)?)/i;
const TRANSACTION_REGEX = /^(\d{2}\/\d{2})\s+(.+?)\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*([DCdc])?$/;
const INSTALLMENT_REGEX = /(?:PARC(?:ELA)?\.?\s*|\s+|\()(\d{1,2})\s*(?:\/|\s+DE\s+)\s*(\d{1,2})\)?/i;

/**
 * Extrai o cabeçalho bruto da fatura Caixa (Mês/Ano de referência e Vencimento).
 */
export function extractInvoiceHeader(pdfText: string): RawInvoiceHeader {
	if (!pdfText || typeof pdfText !== 'string') {
		return { sourceBank: 'caixa', bankName: 'Caixa Econômica Federal' };
	}

	const lines = pdfText.split(/\r?\n/).slice(0, 40).map((l) => l.trim()).filter(Boolean);

	// 1. Vencimento: "Vencimento: 10/09/2026"
	const vencimentoRegex = /(?:vencimento|pagar\s+at[eé]|vence\s+em)[\s\-:]+(\d{2})\/(\d{2})\/(\d{4})/i;
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
					sourceBank: 'caixa',
					bankName: 'Caixa Econômica Federal',
				};
			}
		}
	}

	// 2. Fatura [Mês] [Ano]: "Fatura Setembro 2026"
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
					sourceBank: 'caixa',
					bankName: 'Caixa Econômica Federal',
				};
			}
		}
	}

	// 3. Fatura MM/AAAA: "Fatura 09/2026"
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
					sourceBank: 'caixa',
					bankName: 'Caixa Econômica Federal',
				};
			}
		}
	}

	return { sourceBank: 'caixa', bankName: 'Caixa Econômica Federal' };
}

/**
 * Extrai transações brutas da fatura Caixa.
 */
export function extractRawTransactions(pdfText: string): RawExtractedTransaction[] {
	if (!pdfText || typeof pdfText !== 'string') {
		return [];
	}

	const lines = pdfText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const rawTransactions: RawExtractedTransaction[] = [];

	let currentCardLabel = 'Cartão Principal';
	let currentCardDigits: string | null = null;

	for (const line of lines) {
		const cardMatch = line.match(CARD_HEADER_REGEX);
		if (cardMatch) {
			const cardNum = cardMatch[1];
			if (cardNum) {
				currentCardDigits = cardNum.length >= 4 ? cardNum.slice(-4) : cardNum;
				currentCardLabel = `Cartão ${cardNum}`;
			} else {
				currentCardLabel = cardMatch[0].replace(/[()]/g, '').trim();
				currentCardDigits = null;
			}
		}

		if (IGNORED_LINE_PATTERNS.some((rx) => rx.test(line))) {
			continue;
		}

		const match = line.match(TRANSACTION_REGEX);
		if (match) {
			const originalDate = match[1]; // "06/06" (data original da compra)
			const description = match[2].trim(); // "NORMATEL HOME CENTER 03 DE 03 FORTALEZA"
			const rawValor = match[3];
			const rawTipo = (match[4] || 'D').toUpperCase();

			if (IGNORED_LINE_PATTERNS.some((rx) => rx.test(description))) {
				continue;
			}

			const amount = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'));
			if (isNaN(amount) || amount <= 0) {
				continue;
			}

			const type: 'D' | 'C' = rawTipo === 'C' ? 'C' : 'D';

			// Detecção de parcelas se houver
			let installmentInfo: { current: number; total: number } | null = null;
			const instMatch = description.match(INSTALLMENT_REGEX);
			if (instMatch) {
				const current = parseInt(instMatch[1], 10);
				const total = parseInt(instMatch[2], 10);
				if (total >= 1 && total <= 99 && current <= total) {
					installmentInfo = { current, total };
				}
			}

			rawTransactions.push({
				description,
				amount,
				type,
				originalDate,
				cardLastDigits: currentCardDigits,
				cardLabel: currentCardLabel,
				installmentInfo,
				sourceBank: 'caixa',
			});
		}
	}

	return rawTransactions;
}

/**
 * Função de compatibilidade: extrai e normaliza transações da fatura Caixa.
 */
export function extractTransactions(pdfText: string): any[] {
	const header = extractInvoiceHeader(pdfText);
	const raw = extractRawTransactions(pdfText);
	const normalized = normalizeInvoiceTransactions(raw, header);
	return normalized.transactions.map((t) => ({
		...t,
		dataParcial: t.dataTransacao,
		anoFatura: normalized.anoFatura,
		mesFatura: normalized.mesFatura,
		cartao: t.cardLabel,
		valor: t.amount,
		tipo: t.tipo,
		descricao: t.description,
	}));
}

export function detectInvoiceReference(pdfText: string) {
	const header = extractInvoiceHeader(pdfText);
	return {
		mesReferencia: header.invoiceReferenceMonth,
		ano: header.invoiceYear,
		mes: header.invoiceMonth,
		dataVencimento: header.invoiceDueDate,
	};
}
