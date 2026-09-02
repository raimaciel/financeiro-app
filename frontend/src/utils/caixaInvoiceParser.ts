/**
 * Parser de extração de faturas de cartão de crédito (padrão Caixa Econômica Federal e similares).
 * 
 * Regras:
 * - Extrai linhas no padrão: DD/MM DESCRIÇÃO VALOR(D|C)
 * - Identifica o mês/ano de referência da fatura no cabeçalho (competência)
 * - Associa o número do cartão via padrão (Cartão XXXX)
 * - Extrai os últimos 4 dígitos para vinculação automática
 * - Preserva a descrição completa sem truncamento (inclusive parcelas "03 DE 03" e cidades)
 * - NUNCA infere o ano automaticamente se não houver no cabeçalho: retorna dataTransacao "DD/MM" e precisaRevisao: true
 */

export interface CaixaExtractedTransaction {
	id?: string;
	dataTransacao: string; // "DD/MM" - Data impressa na linha (compra original)
	dataParcial: string; // "DD/MM" - Compatibilidade
	dataCompetencia?: string; // "YYYY-MM-DD" - Data baseada no mês/ano de competência da fatura
	mesReferenciaFatura?: string; // "YYYY-MM"
	anoFatura?: number;
	mesFatura?: number;
	descricao: string; // Descrição integral do lançamento (sem truncamento)
	valor: number; // Valor numérico positivo (ex: 154.30)
	tipo: 'D' | 'C'; // 'D' (Débito) ou 'C' (Crédito / Pagamento / Estorno)
	cartao: string; // Identificador do cartão no PDF (ex: "Cartão 2583")
	cartaoDigitos?: string | null; // Últimos 4 dígitos extraídos (ex: "2583")
	creditCardId?: string | null; // ID vinculado do banco
	cartaoIdentificado?: boolean;
	cardLabel?: string;
	precisaRevisao: true;
}

export interface CaixaInvoiceReference {
	mesReferencia?: string; // "YYYY-MM"
	ano?: number;
	mes?: number;
	dataVencimento?: string; // "YYYY-MM-DD"
	descricaoReferencia?: string;
}

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

/**
 * Detecta o mês/ano de competência e vencimento da fatura a partir do texto do cabeçalho.
 */
export function detectInvoiceReference(pdfText: string): CaixaInvoiceReference {
	if (!pdfText || typeof pdfText !== 'string') {
		return {};
	}

	const lines = pdfText.split(/\r?\n/).slice(0, 40).map((l) => l.trim()).filter(Boolean);

	// 1. Padrão Vencimento: "Vencimento: 10/09/2026" ou "Vencimento 15/09/2026" ou "Pagar até 10/09/2026"
	const vencimentoRegex = /(?:vencimento|pagar\s+at[eé]|vence\s+em)[\s\-:]+(\d{2})\/(\d{2})\/(\d{4})/i;
	for (const line of lines) {
		const match = line.match(vencimentoRegex);
		if (match) {
			const day = match[1];
			const month = parseInt(match[2], 10);
			const year = parseInt(match[3], 10);
			if (month >= 1 && month <= 12 && year >= 1970 && year <= 2100) {
				return {
					mesReferencia: `${year}-${String(month).padStart(2, '0')}`,
					ano: year,
					mes: month,
					dataVencimento: `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`,
					descricaoReferencia: `Fatura ${match[2]}/${year} (Vencimento ${day}/${match[2]}/${year})`,
				};
			}
		}
	}

	// 2. Padrão Fatura [Mês] [Ano]: "Fatura Setembro 2026", "Fatura de Setembro de 2026", "Fatura 09/2026"
	const faturaNomeMesRegex = /(?:fatura|demonstrativo|refer[eê]ncia)[\s\-:]+(?:de\s+)?([a-zA-ZçÇ]{3,9})\b(?:\s+(?:de\s+)?(\d{4}))?/i;
	for (const line of lines) {
		const match = line.match(faturaNomeMesRegex);
		if (match) {
			const monthName = match[1].toLowerCase().replace('.', '');
			const monthNum = MONTH_NAMES_MAP[monthName];
			const year = match[2] ? parseInt(match[2], 10) : new Date().getFullYear();
			if (monthNum) {
				return {
					mesReferencia: `${year}-${String(monthNum).padStart(2, '0')}`,
					ano: year,
					mes: monthNum,
					descricaoReferencia: `Fatura ${match[1]} ${year}`,
				};
			}
		}
	}

	// 3. Padrão Fatura MM/AAAA: "Fatura 09/2026" ou "09/2026"
	const faturaNumMesRegex = /(?:fatura|demonstrativo|refer[eê]ncia)[\s\-:]+(\d{2})\/(\d{4})/i;
	for (const line of lines) {
		const match = line.match(faturaNumMesRegex);
		if (match) {
			const month = parseInt(match[1], 10);
			const year = parseInt(match[2], 10);
			if (month >= 1 && month <= 12) {
				return {
					mesReferencia: `${year}-${String(month).padStart(2, '0')}`,
					ano: year,
					mes: month,
					descricaoReferencia: `Fatura ${match[1]}/${year}`,
				};
			}
		}
	}

	// 4. Padrão Melhor data para compra / Fechamento: "Melhor data para compra: 03/09/2026"
	const melhorDataRegex = /(?:melhor\s+data\s+para\s+compra|data\s+de\s+fechamento)[\s\-:]+(\d{2})\/(\d{2})\/(\d{4})/i;
	for (const line of lines) {
		const match = line.match(melhorDataRegex);
		if (match) {
			const month = parseInt(match[2], 10);
			const year = parseInt(match[3], 10);
			if (month >= 1 && month <= 12) {
				return {
					mesReferencia: `${year}-${String(month).padStart(2, '0')}`,
					ano: year,
					mes: month,
					descricaoReferencia: `Fatura ${match[2]}/${year}`,
				};
			}
		}
	}

	return {};
}

/**
 * Extrai transações preservando 100% da descrição (Bug 1),
 * associando data de competência da fatura (Bug 2),
 * e identificando os 4 últimos dígitos do cartão (Bug 3).
 */
export function extractTransactions(pdfText: string): CaixaExtractedTransaction[] {
	if (!pdfText || typeof pdfText !== 'string') {
		return [];
	}

	const invoiceRef = detectInvoiceReference(pdfText);
	const lines = pdfText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const transactions: CaixaExtractedTransaction[] = [];

	let currentCardLabel = 'Cartão Principal';
	let currentCardDigits: string | null = null;

	for (const line of lines) {
		// 1. Detectar cabeçalho ou troca de cartão (ex: "(Cartão 2583)" ou "(Cartão 2424)")
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

		// 2. Ignorar linhas de dados pessoais, totalizadores e cabeçalhos fixos
		if (IGNORED_LINE_PATTERNS.some((rx) => rx.test(line))) {
			continue;
		}

		// 3. Casar padrão de transação: DD/MM DESCRIÇÃO VALOR(D|C)
		const match = line.match(TRANSACTION_REGEX);
		if (match) {
			const dataTransacao = match[1]; // "06/06" (data original da compra)
			const rawDesc = match[2].trim(); // "NORMATEL HOME CENTER 03 DE 03 FORTALEZA" (completo!)
			const rawValor = match[3];
			const rawTipo = (match[4] || 'D').toUpperCase();

			// Ignorar se a própria descrição for um totalizador
			if (IGNORED_LINE_PATTERNS.some((rx) => rx.test(rawDesc))) {
				continue;
			}

			// Converter valor brasileiro (1.234,56 -> 1234.56)
			const valor = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'));
			if (isNaN(valor) || valor <= 0) {
				continue;
			}

			const tipo: 'D' | 'C' = rawTipo === 'C' ? 'C' : 'D';

			// Calcular data de competência baseada no mês/ano da fatura (Bug 2)
			let dataCompetencia: string | undefined = undefined;
			if (invoiceRef.ano && invoiceRef.mes) {
				const dayPart = dataTransacao.split('/')[0].padStart(2, '0');
				const monthPart = String(invoiceRef.mes).padStart(2, '0');
				const yearPart = invoiceRef.ano;
				dataCompetencia = `${yearPart}-${monthPart}-${dayPart}`;
			}

			transactions.push({
				id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined,
				dataTransacao,
				dataParcial: dataTransacao,
				dataCompetencia,
				mesReferenciaFatura: invoiceRef.mesReferencia,
				anoFatura: invoiceRef.ano,
				mesFatura: invoiceRef.mes,
				descricao: rawDesc, // Preserva 100% da descrição
				valor,
				tipo,
				cartao: currentCardLabel,
				cartaoDigitos: currentCardDigits,
				precisaRevisao: true,
			});
		}
	}

	return transactions;
}
