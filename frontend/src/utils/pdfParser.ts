import * as pdfjsLib from 'pdfjs-dist';

// Configuração do worker do pdfjs-dist para ambientes Vite/Browser
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
	try {
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
			'pdfjs-dist/build/pdf.worker.mjs',
			import.meta.url
		).toString();
	} catch {
		pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.mjs';
	}
}

/**
 * Interface da transação extraída do PDF da fatura ou extrato.
 */
export interface ParsedTransaction {
	date: string; // Formato ISO YYYY-MM-DD
	description: string; // Descrição limpa do estabelecimento/lançamento
	amount: number; // Valor numérico: negativo para débito/compra, positivo para crédito/estorno/pagamento
	cardLast4?: string; // Últimos 4 dígitos do cartão associado (ex: "6768")
	cardLabel?: string; // Rótulo visual do cartão detectado no cabeçalho (ex: "Cartão 5555****6768")
	installments?: number; // Total de parcelas (ex: 5 em "02/05")
	installmentCurrent?: number; // Parcela atual (ex: 2 em "02/05")
	layout?: string; // Identificador do layout utilizado para debug
}

/**
 * Contexto de cartão ativo durante a leitura sequencial das linhas do PDF.
 */
export interface CardContext {
	last4: string;
	label: string;
}

/**
 * Meses em português para conversão de datas textuais (Layout 3).
 */
const MONTHS_MAP: Record<string, string> = {
	jan: '01',
	fev: '02',
	mar: '03',
	abr: '04',
	mai: '05',
	jun: '06',
	jul: '07',
	ago: '08',
	set: '09',
	out: '10',
	nov: '11',
	dez: '12',
	janeiro: '01',
	fevereiro: '02',
	março: '03',
	marco: '03',
	abril: '04',
	maio: '05',
	junho: '06',
	julho: '07',
	agosto: '08',
	setembro: '09',
	outubro: '10',
	novembro: '11',
	dezembro: '12',
};

/**
 * 1. Extrai o texto completo do arquivo PDF, agrupando os fragmentos por linha
 * usando a coordenada vertical Y e ordenando horizontalmente por X.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
	const arrayBuffer = await file.arrayBuffer();
	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(arrayBuffer),
		useSystemFonts: true,
	});

	const pdfDocument = await loadingTask.promise;
	const numPages = pdfDocument.numPages;
	const allLines: string[] = [];

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdfDocument.getPage(pageNum);
		const textContent = await page.getTextContent();
		const items = textContent.items as Array<{
			str: string;
			transform: number[]; // [scaleX, skewY, skewX, scaleY, x, y]
			width: number;
			height: number;
		}>;

		if (!items || items.length === 0) continue;

		// Agrupar itens com coordenada Y similar (tolerância de ~4px)
		const linesMap: Map<number, Array<{ x: number; text: string }>> = new Map();

		for (const item of items) {
			const text = item.str;
			if (!text || text.trim() === '') continue;

			const x = item.transform[4];
			const y = Math.round(item.transform[5]);

			// Encontra uma linha existente com tolerância de até 4px na vertical
			let matchedY: number | null = null;
			for (const existingY of linesMap.keys()) {
				if (Math.abs(existingY - y) <= 4) {
					matchedY = existingY;
					break;
				}
			}

			if (matchedY !== null) {
				linesMap.get(matchedY)!.push({ x, text });
			} else {
				linesMap.set(y, [{ x, text }]);
			}
		}

		// Ordenar linhas de cima para baixo (coordenada Y decrescente no PDF)
		const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);

		for (const y of sortedY) {
			const lineItems = linesMap.get(y)!;
			// Ordenar itens da esquerda para a direita (coordenada X crescente)
			lineItems.sort((a, b) => a.x - b.x);
			const lineText = lineItems.map((it) => it.text.trim()).filter(Boolean).join(' ');
			if (lineText.trim()) {
				allLines.push(lineText.trim());
			}
		}
	}

	return allLines.join('\n');
}

/**
 * Detecta cabeçalhos de cartão no texto da fatura.
 * Suporta múltiplos formatos:
 * - "5555****6768", "543882*******1711"
 * - "CARTÃO 4203 **** **** 7380", "CARTÃO •••• 1234"
 * - "Cartão Titular - Final 6768", "Cartão Adicional: Maria (1711)"
 */
export function detectCardHeader(line: string): CardContext | null {
	const trimmed = line.trim();

	// Padrão 1: Dígitos mascarados com asteriscos ou pontos (ex: 5555****6768 ou 543882*******1711 ou 4203 **** **** 7380)
	const maskedRegex = /(?:cart[aã]o|card)?\s*(?:[a-zA-Z\s]+)?(?:(\d{4,6})[\s\*\.\-•]{3,}(\d{4}))/i;
	const matchMasked = trimmed.match(maskedRegex);
	if (matchMasked) {
		const last4 = matchMasked[2];
		return {
			last4,
			label: trimmed.length < 60 ? trimmed : `Cartão final ${last4}`,
		};
	}

	// Padrão 2: "Final 1234", "•••• 1234", "**** 1234"
	const finalRegex = /(?:final|termina em|c[oó]digo|n[úu]mero|cart[aã]o)[\s\:\-]+(?:[\*\.\-•\s]*(\d{4}))/i;
	const matchFinal = trimmed.match(finalRegex);
	if (matchFinal) {
		const last4 = matchFinal[1];
		return {
			last4,
			label: trimmed.length < 60 ? trimmed : `Cartão final ${last4}`,
		};
	}

	// Padrão 3: Sequência simples de 4 dígitos precedida por máscara explícita (ex: "**** 6768" ou "•••• 6768")
	const simpleMaskMatch = trimmed.match(/[\*•]{3,}\s*(\d{4})/);
	if (simpleMaskMatch) {
		const last4 = simpleMaskMatch[1];
		return {
			last4,
			label: trimmed.length < 60 ? trimmed : `Cartão final ${last4}`,
		};
	}

	return null;
}

/**
 * Detecta o ano de referência na fatura a partir de datas ou cabeçalhos de vencimento.
 */
export function detectReferenceYear(text: string): number {
	const currentYear = new Date().getFullYear();

	// Procura anos de 4 dígitos próximos a palavras-chave (Vencimento: 15/08/2026, Fatura Agosto/2026)
	const headerYearMatch = text.match(/(?:vencimento|fechamento|fatura|per[ií]odo|m[eê]s)[^\n\r]{0,30}\b(202[0-9])\b/i);
	if (headerYearMatch) {
		return parseInt(headerYearMatch[1], 10);
	}

	// Procura qualquer ano no intervalo 2020..2030 no texto
	const allYears = Array.from(text.matchAll(/\b(202[0-9])\b/g)).map((m) => parseInt(m[1], 10));
	if (allYears.length > 0) {
		// Retorna o ano mais frequente
		const counts: Record<number, number> = {};
		for (const y of allYears) counts[y] = (counts[y] || 0) + 1;
		const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
		return parseInt(sorted[0][0], 10);
	}

	return currentYear;
}

/**
 * Converte valor em string (pt-BR ou en-US) para número float.
 * Retorna negativo para compras/débitos e positivo para pagamentos/estornos/créditos.
 */
export function parseAmountValue(amountStr: string, rawDescription: string): number | null {
	let str = amountStr.trim();
	let isCredit = false;

	// Verifica sufixo ou prefixo de crédito (CR, -, Estorno, Pagamento)
	if (/CR$/i.test(str) || /\+$/i.test(str)) {
		isCredit = true;
		str = str.replace(/(?:CR|\+)$/i, '').trim();
	}

	if (/^[\-]/.test(str) || /[\-]$/.test(str)) {
		isCredit = true;
		str = str.replace(/[\-]/g, '').trim();
	}

	// Palavras-chave de crédito na descrição
	const descUpper = rawDescription.toUpperCase();
	if (
		descUpper.includes('PAGAMENTO') ||
		descUpper.includes('ESTORNO') ||
		descUpper.includes('CREDITO') ||
		descUpper.includes('CRÉDITO') ||
		descUpper.includes('REEMBOLSO') ||
		descUpper.includes('AJUSTE A CREDITO')
	) {
		isCredit = true;
	}

	// Remove 'R$', espaços e converte formato 1.234,56 para 1234.56
	str = str.replace(/R\$\s*/gi, '').replace(/\s+/g, '');
	if (str.includes(',') && str.includes('.')) {
		if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
			// Formato 1.234,56
			str = str.replace(/\./g, '').replace(',', '.');
		} else {
			// Formato 1,234.56
			str = str.replace(/,/g, '');
		}
	} else if (str.includes(',')) {
		str = str.replace(',', '.');
	}

	const val = parseFloat(str);
	if (isNaN(val) || val === 0) return null;

	// Regra: Compras/Despesas = negativo (-val), Pagamentos/Créditos = positivo (+val)
	return isCredit ? Math.abs(val) : -Math.abs(val);
}

/**
 * Extrai parcelamento da descrição (ex: "LOJA 02/05", "MAGAZINE (3/10)", "PARC 01/12").
 */
export function extractInstallments(description: string): {
	cleanDescription: string;
	installments: number;
	installmentCurrent: number;
} {
	const regex = /(?:\(|\b)?(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*[\/|\\]\s*(\d{1,2})(?:\)|\b)?/i;
	const match = description.match(regex);

	if (match) {
		const current = parseInt(match[1], 10);
		const total = parseInt(match[2], 10);

		if (total >= 1 && total <= 99 && current <= total && current >= 1) {
			const cleanDesc = description.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
			return {
				cleanDescription: cleanDesc || description,
				installments: total,
				installmentCurrent: current,
			};
		}
	}

	return {
		cleanDescription: description,
		installments: 1,
		installmentCurrent: 1,
	};
}

/**
 * ESTRATÉGIA 1: Layout com Data DD/MM (Ex: Nubank, Inter, C6, Itaú)
 * Linhas no formato: "15/08 Supermercado Extra 150,50" ou "15/08 Uber -45,00"
 */
export function parseLayoutDDMM(lines: string[], refYear: number): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	let activeCard: CardContext | null = null;

	// Regex: Data DD/MM no início da linha, seguida da descrição e valor monetário no fim
	const lineRegex = /^(\d{2})\/(\d{2})\b\s+(.+?)\s+((?:R\$\s*)?[\-\+]?\s*\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[\-\+]|\s*CR)?)$/i;

	for (const line of lines) {
		const card = detectCardHeader(line);
		if (card) {
			activeCard = card;
			continue;
		}

		const match = line.match(lineRegex);
		if (match) {
			const day = match[1];
			const month = match[2];
			const rawDesc = match[3].trim();
			const amountStr = match[4].trim();

			const amount = parseAmountValue(amountStr, rawDesc);
			if (amount === null) continue;

			const { cleanDescription, installments, installmentCurrent } = extractInstallments(rawDesc);
			const isoDate = `${refYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

			transactions.push({
				date: isoDate,
				description: cleanDescription,
				amount,
				cardLast4: activeCard?.last4,
				cardLabel: activeCard?.label,
				installments,
				installmentCurrent,
				layout: 'DD/MM',
			});
		}
	}

	return transactions;
}

/**
 * ESTRATÉGIA 2: Layout com Data Completa DD/MM/AAAA ou DD/MM/AA (Ex: Bradesco, Santander, Banco do Brasil)
 * Linhas no formato: "15/08/2026 RESTAURANTE SABOR 120,00" ou "15/08/26 POSTO IPIRANGA 200,00"
 */
export function parseLayoutFullDate(lines: string[]): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	let activeCard: CardContext | null = null;

	// Regex: Data DD/MM/AAAA ou DD/MM/AA no início da linha
	const lineRegex = /^(\d{2})\/(\d{2})\/(\d{2,4})\b\s+(.+?)\s+((?:R\$\s*)?[\-\+]?\s*\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[\-\+]|\s*CR)?)$/i;

	for (const line of lines) {
		const card = detectCardHeader(line);
		if (card) {
			activeCard = card;
			continue;
		}

		const match = line.match(lineRegex);
		if (match) {
			const day = match[1];
			const month = match[2];
			let year = match[3];
			if (year.length === 2) {
				year = `20${year}`;
			}

			const rawDesc = match[4].trim();
			const amountStr = match[5].trim();

			const amount = parseAmountValue(amountStr, rawDesc);
			if (amount === null) continue;

			const { cleanDescription, installments, installmentCurrent } = extractInstallments(rawDesc);
			const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

			transactions.push({
				date: isoDate,
				description: cleanDescription,
				amount,
				cardLast4: activeCard?.last4,
				cardLabel: activeCard?.label,
				installments,
				installmentCurrent,
				layout: 'DD/MM/AAAA',
			});
		}
	}

	return transactions;
}

/**
 * ESTRATÉGIA 3: Layout com Mês por Extenso/Abreviado (Ex: "15 ago 2026", "15 AGO Uber 32,50", "15 ago. Netflix 55,90")
 */
export function parseLayoutMonthName(lines: string[], refYear: number): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	let activeCard: CardContext | null = null;

	// Regex: Dia + Mês textual (com ou sem ano) no início da linha
	const lineRegex = /^(\d{1,2})\s+([a-zA-ZçÇ]{3,9}\.?)\s+(?:(\d{4})\s+)?(.+?)\s+((?:R\$\s*)?[\-\+]?\s*\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[\-\+]|\s*CR)?)$/i;

	for (const line of lines) {
		const card = detectCardHeader(line);
		if (card) {
			activeCard = card;
			continue;
		}

		const match = line.match(lineRegex);
		if (match) {
			const day = match[1].padStart(2, '0');
			const monthRaw = match[2].toLowerCase().replace('.', '');
			const yearStr = match[3] || String(refYear);
			const rawDesc = match[4].trim();
			const amountStr = match[5].trim();

			const monthNum = MONTHS_MAP[monthRaw];
			if (!monthNum) continue;

			const amount = parseAmountValue(amountStr, rawDesc);
			if (amount === null) continue;

			const { cleanDescription, installments, installmentCurrent } = extractInstallments(rawDesc);
			const isoDate = `${yearStr}-${monthNum}-${day}`;

			transactions.push({
				date: isoDate,
				description: cleanDescription,
				amount,
				cardLast4: activeCard?.last4,
				cardLabel: activeCard?.label,
				installments,
				installmentCurrent,
				layout: 'DD MMM AAAA',
			});
		}
	}

	return transactions;
}

/**
 * Remove transações duplicadas idênticas extraídas.
 */
function deduplicateTransactions(list: ParsedTransaction[]): ParsedTransaction[] {
	const seen = new Set<string>();
	const result: ParsedTransaction[] = [];

	for (const tx of list) {
		const key = `${tx.date}_${tx.description.toLowerCase().trim()}_${tx.amount}_${tx.cardLast4 || 'none'}_${tx.installmentCurrent || 1}`;
		if (!seen.has(key)) {
			seen.add(key);
			result.push(tx);
		}
	}

	return result;
}

/**
 * Função Principal de Parsing:
 * Analisa o texto extraído, detecta o ano de referência, testa as 3 estratégias de layout
 * mantendo o contexto dos cartões associados, e retorna a lista com o maior número de transações válidas.
 */
export function parseTransactionsFromText(text: string, referenceYear?: number): ParsedTransaction[] {
	if (!text || text.trim() === '') return [];

	const refYear = referenceYear || detectReferenceYear(text);
	const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

	const res1 = parseLayoutDDMM(lines, refYear);
	const res2 = parseLayoutFullDate(lines);
	const res3 = parseLayoutMonthName(lines, refYear);

	// Seleciona a estratégia que extraiu o maior número de transações
	const candidates = [res1, res2, res3].sort((a, b) => b.length - a.length);
	let bestMatch = candidates[0];

	// Caso duas estratégias tenham capturado transações diferentes em seções distintas do PDF, podemos uni-las
	if (candidates[1] && candidates[1].length > 0 && bestMatch.length > 0) {
		const merged = deduplicateTransactions([...bestMatch, ...candidates[1]]);
		if (merged.length > bestMatch.length) {
			bestMatch = merged;
		}
	}

	return deduplicateTransactions(bestMatch);
}
