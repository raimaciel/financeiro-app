/**
 * Parser de extração de faturas de cartão de crédito (padrão Caixa Econômica Federal e similares).
 * 
 * Regras:
 * - Extrai linhas no padrão: DD/MM DESCRIÇÃO VALOR(D|C)
 * - Associa o número do cartão via padrão (Cartão XXXX)
 * - Ignora linhas de totalização e resumo
 * - Ignora seções com dados pessoais (nome, CPF, endereço, limite)
 * - NUNCA infere o ano automaticamente: retorna dataParcial "DD/MM" e precisaRevisao: true
 */

export interface CaixaExtractedTransaction {
	id?: string;
	dataParcial: string; // "DD/MM"
	descricao: string; // Descrição limpa do lançamento
	valor: number; // Valor numérico positivo (ex: 154.30)
	tipo: 'D' | 'C'; // 'D' (Débito) ou 'C' (Crédito / Pagamento / Estorno)
	cartao: string; // Identificador do cartão (ex: "Cartão 1234")
	precisaRevisao: true;
}

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
];

const CARD_HEADER_REGEX = /(?:\(?\s*Cart[aã]o(?:\s*[:\-])?\s+(?:[\w\*]+\s+)*(\d{4}|\d+)\s*\)?)/i;
const TRANSACTION_REGEX = /^(\d{2}\/\d{2})\s+(.+?)\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*([DCdc])?$/;

export function extractTransactions(pdfText: string): CaixaExtractedTransaction[] {
	if (!pdfText || typeof pdfText !== 'string') {
		return [];
	}

	const lines = pdfText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const transactions: CaixaExtractedTransaction[] = [];
	let currentCard = 'Cartão Principal';

	for (const line of lines) {
		// 1. Detectar cabeçalho ou troca de cartão
		const cardMatch = line.match(CARD_HEADER_REGEX);
		if (cardMatch) {
			const cardNum = cardMatch[1];
			currentCard = cardNum ? `Cartão ${cardNum}` : cardMatch[0].replace(/[()]/g, '').trim();
		}

		// 2. Ignorar linhas de dados pessoais, totalizadores e cabeçalhos fixos
		if (IGNORED_LINE_PATTERNS.some((rx) => rx.test(line))) {
			continue;
		}

		// 3. Casar padrão de transação: DD/MM DESCRIÇÃO VALOR(D|C)
		const match = line.match(TRANSACTION_REGEX);
		if (match) {
			const dataParcial = match[1];
			const rawDesc = match[2].trim();
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

			transactions.push({
				id: crypto.randomUUID ? crypto.randomUUID() : undefined,
				dataParcial,
				descricao: rawDesc,
				valor,
				tipo,
				cartao: currentCard,
				precisaRevisao: true,
			});
		}
	}

	return transactions;
}
