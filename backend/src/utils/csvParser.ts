import type { RawImportTransaction } from './ofxParser';

export interface BankPreset {
	id: string;
	name: string;
	delimiter?: string;
	dateCol?: string[];
	descCol?: string[];
	amountCol?: string[];
	creditCol?: string[];
	debitCol?: string[];
	typeCol?: string[];
	categoryCol?: string[];
}

export const BANK_PRESETS: Record<string, BankPreset> = {
	nubank: {
		id: 'nubank',
		name: 'Nubank',
		dateCol: ['data', 'date'],
		descCol: ['descrição', 'descricao', 'description', 'titulo', 'title'],
		amountCol: ['valor', 'amount'],
		categoryCol: ['categoria', 'category'],
	},
	inter: {
		id: 'inter',
		name: 'Banco Inter',
		delimiter: ';',
		dateCol: ['data lançamento', 'data lancamento', 'data'],
		descCol: ['descrição', 'descricao', 'histórico', 'historico'],
		amountCol: ['valor'],
	},
	itau: {
		id: 'itau',
		name: 'Itaú',
		delimiter: ';',
		dateCol: ['data'],
		descCol: ['lançamento', 'lancamento', 'histórico', 'historico', 'descrição'],
		amountCol: ['valor'],
	},
	bradesco: {
		id: 'bradesco',
		name: 'Bradesco',
		delimiter: ';',
		dateCol: ['data'],
		descCol: ['histórico', 'historico', 'descrição'],
		creditCol: ['crédito (r$)', 'credito (r$)', 'crédito', 'credito'],
		debitCol: ['débito (r$)', 'debito (r$)', 'débito', 'debito'],
		amountCol: ['valor (r$)', 'valor'],
	},
	santander: {
		id: 'santander',
		name: 'Santander',
		delimiter: ';',
		dateCol: ['data'],
		descCol: ['descrição', 'descricao', 'histórico', 'historico'],
		amountCol: ['valor (r$)', 'valor'],
	},
	bb: {
		id: 'bb',
		name: 'Banco do Brasil',
		delimiter: ';',
		dateCol: ['data', 'data balancete'],
		descCol: ['histórico', 'historico', 'detalhe'],
		amountCol: ['valor'],
	},
	c6: {
		id: 'c6',
		name: 'C6 Bank',
		dateCol: ['data'],
		descCol: ['descrição', 'descricao', 'estabelecimento'],
		amountCol: ['valor'],
		categoryCol: ['categoria'],
	},
	generic: {
		id: 'generic',
		name: 'Genérico / Automático',
		dateCol: ['data', 'date', 'data lançamento', 'data lancamento', 'dt', 'data_movimento', 'data transacao'],
		descCol: ['descrição', 'descricao', 'description', 'histórico', 'historico', 'memo', 'detalhe', 'titulo', 'lançamento', 'lancamento', 'estabelecimento'],
		amountCol: ['valor', 'amount', 'valor (r$)', 'valor r$', 'vlr', 'quantia'],
		creditCol: ['crédito (r$)', 'credito (r$)', 'crédito', 'credito', 'entradas', 'receitas'],
		debitCol: ['débito (r$)', 'debito (r$)', 'débito', 'debito', 'saídas', 'saidas', 'despesas'],
		categoryCol: ['categoria', 'category'],
	},
};

/**
 * Detecta o delimitador mais provável de uma string CSV (; , \t).
 */
export function detectDelimiter(csvText: string): string {
	const firstLines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
	if (firstLines.length === 0) return ',';

	const counts = { ';': 0, ',': 0, '\t': 0 };

	for (const line of firstLines) {
		counts[';'] += (line.match(/;/g) || []).length;
		counts[','] += (line.match(/,/g) || []).length;
		counts['\t'] += (line.match(/\t/g) || []).length;
	}

	if (counts[';'] >= counts[','] && counts[';'] >= counts['\t'] && counts[';'] > 0) return ';';
	if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
	return ',';
}

/**
 * Faz split de uma linha CSV respeitando aspas.
 */
export function parseCSVLine(line: string, delimiter: string): string[] {
	const result: string[] = [];
	let current = '';
	let insideQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (char === '"') {
			if (insideQuotes && nextChar === '"') {
				current += '"';
				i++; // Pula a aspa escapada
			} else {
				insideQuotes = !insideQuotes;
			}
		} else if (char === delimiter && !insideQuotes) {
			result.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}

	result.push(current.trim());
	return result;
}

/**
 * Converte data em vários formatos brasileiros e ISO para YYYY-MM-DD.
 */
export function parseCsvDate(dateStr: string): string | null {
	if (!dateStr) return null;
	const cleaned = dateStr.trim().replace(/["']/g, '');

	// YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
		return cleaned;
	}

	// DD/MM/YYYY ou DD-MM-YYYY
	const matchDmy = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
	if (matchDmy) {
		const [, d, m, y] = matchDmy;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}

	// DD/MM/YY
	const matchShortYear = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
	if (matchShortYear) {
		const [, d, m, y] = matchShortYear;
		const fullYear = parseInt(y, 10) > 50 ? `19${y}` : `20${y}`;
		return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}

	// YYYYMMDD
	const matchCompact = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
	if (matchCompact) {
		const [, y, m, d] = matchCompact;
		return `${y}-${m}-${d}`;
	}

	return null;
}

/**
 * Converte valor numérico formatado em BRL ou internacional para float numérico.
 */
export function parseCsvAmount(valStr: string): { amount: number; rawAmount: number; isNegative: boolean } | null {
	if (!valStr || typeof valStr !== 'string') return null;

	let str = valStr.trim().replace(/["'\s]/g, '').replace(/^R\$/i, '');
	if (!str || str === '-' || str === '+') return null;

	// Trata formato entre parênteses para negativo, ex: (150,00)
	let isNegative = false;
	if (str.startsWith('(') && str.endsWith(')')) {
		isNegative = true;
		str = str.slice(1, -1);
	}

	if (str.startsWith('-')) {
		isNegative = true;
		str = str.substring(1);
	} else if (str.endsWith('-')) {
		isNegative = true;
		str = str.slice(0, -1);
	} else if (str.startsWith('+')) {
		str = str.substring(1);
	}

	// Verifica se usa formato brasileiro (ex: 1.234,56 ou 150,50)
	if (str.includes(',') && str.includes('.')) {
		const lastComma = str.lastIndexOf(',');
		const lastDot = str.lastIndexOf('.');
		if (lastComma > lastDot) {
			// Formato BR: 1.234,56
			str = str.replace(/\./g, '').replace(',', '.');
		} else {
			// Formato US: 1,234.56
			str = str.replace(/,/g, '');
		}
	} else if (str.includes(',')) {
		// Apenas vírgula: 150,50 -> 150.50
		str = str.replace(',', '.');
	}

	// Remove qualquer caractere restante não numérico
	str = str.replace(/[^\d.]/g, '');
	const num = parseFloat(str);

	if (isNaN(num)) return null;

	const rawAmount = isNegative ? -Math.abs(num) : Math.abs(num);
	const amount = Math.abs(num);

	return {
		amount: Number(amount.toFixed(2)),
		rawAmount: Number(rawAmount.toFixed(2)),
		isNegative,
	};
}

/**
 * Encontra o índice da coluna correspondente na lista de cabeçalhos.
 */
function findColIndex(headers: string[], candidateNames: string[]): number {
	const normalizedHeaders = headers.map((h) =>
		h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/["']/g, '')
	);

	for (const candidate of candidateNames) {
		const normCandidate = candidate
			.toLowerCase()
			.trim()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');

		// Match exato
		const exactIdx = normalizedHeaders.findIndex((h) => h === normCandidate);
		if (exactIdx !== -1) return exactIdx;

		// Match parcial
		const partialIdx = normalizedHeaders.findIndex((h) => h.includes(normCandidate) || normCandidate.includes(h));
		if (partialIdx !== -1) return partialIdx;
	}

	return -1;
}

/**
 * Parser de arquivos CSV de extratos bancários com suporte a presets por banco e autodetecção.
 */
export function parseCSV(csvContent: string, bankPresetId: string = 'generic'): RawImportTransaction[] {
	if (!csvContent || typeof csvContent !== 'string') {
		return [];
	}

	const preset = BANK_PRESETS[bankPresetId] || BANK_PRESETS['generic'];
	const delimiter = preset.delimiter || detectDelimiter(csvContent);

	const rawLines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
	if (rawLines.length < 2) return [];

	// Localiza a linha do cabeçalho (geralmente a primeira linha com texto)
	let headerIndex = 0;
	let headers: string[] = [];

	for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
		const parsed = parseCSVLine(rawLines[i], delimiter);
		const hasDateHeader = parsed.some((col) => /data|date|dt/i.test(col));
		const hasValueHeader = parsed.some((col) => /valor|amount|vlr|credito|debito/i.test(col));

		if (hasDateHeader && hasValueHeader) {
			headerIndex = i;
			headers = parsed;
			break;
		}
	}

	if (headers.length === 0) {
		headerIndex = 0;
		headers = parseCSVLine(rawLines[0], delimiter);
	}

	// Mapeia colunas
	const dateIdx = findColIndex(headers, preset.dateCol || BANK_PRESETS['generic'].dateCol!);
	const descIdx = findColIndex(headers, preset.descCol || BANK_PRESETS['generic'].descCol!);
	const amountIdx = findColIndex(headers, preset.amountCol || BANK_PRESETS['generic'].amountCol!);
	const creditIdx = preset.creditCol ? findColIndex(headers, preset.creditCol) : -1;
	const debitIdx = preset.debitCol ? findColIndex(headers, preset.debitCol) : -1;

	const transactions: RawImportTransaction[] = [];

	for (let i = headerIndex + 1; i < rawLines.length; i++) {
		const cols = parseCSVLine(rawLines[i], delimiter);
		if (cols.length < 2) continue;

		// 1. Data
		let dateStr = '';
		if (dateIdx !== -1 && cols[dateIdx]) {
			dateStr = cols[dateIdx];
		} else {
			// Procura primeira coluna com formato de data
			const foundDate = cols.find((c) => parseCsvDate(c) !== null);
			if (foundDate) dateStr = foundDate;
		}

		const parsedDate = parseCsvDate(dateStr);
		if (!parsedDate) continue; // Linha sem data válida (ex: totalizadores de rodapé)

		// 2. Descrição
		let description = 'Transação Importada';
		if (descIdx !== -1 && cols[descIdx]) {
			description = cols[descIdx].replace(/["']/g, '').trim();
		} else {
			// Procura primeira coluna de texto longo
			const textCol = cols.find((c, idx) => idx !== dateIdx && idx !== amountIdx && c.length > 2 && isNaN(Number(c)));
			if (textCol) description = textCol.replace(/["']/g, '').trim();
		}

		// 3. Valor e Tipo
		let amount = 0;
		let rawAmount = 0;
		let type: 'income' | 'expense' = 'expense';

		if (creditIdx !== -1 && debitIdx !== -1) {
			// Colunas separadas de crédito e débito (ex: Bradesco)
			const creditParsed = parseCsvAmount(cols[creditIdx]);
			const debitParsed = parseCsvAmount(cols[debitIdx]);

			if (creditParsed && creditParsed.amount > 0) {
				amount = creditParsed.amount;
				rawAmount = creditParsed.amount;
				type = 'income';
			} else if (debitParsed && debitParsed.amount > 0) {
				amount = debitParsed.amount;
				rawAmount = -debitParsed.amount;
				type = 'expense';
			} else {
				continue;
			}
		} else if (amountIdx !== -1 && cols[amountIdx]) {
			const parsedAmt = parseCsvAmount(cols[amountIdx]);
			if (!parsedAmt || parsedAmt.amount === 0) continue;

			amount = parsedAmt.amount;
			rawAmount = parsedAmt.rawAmount;
			type = parsedAmt.isNegative ? 'expense' : 'income';
		} else {
			// Procura primeira coluna com valor numérico
			const numCol = cols.find((c, idx) => idx !== dateIdx && parseCsvAmount(c) !== null);
			if (!numCol) continue;
			const parsedAmt = parseCsvAmount(numCol);
			if (!parsedAmt || parsedAmt.amount === 0) continue;

			amount = parsedAmt.amount;
			rawAmount = parsedAmt.rawAmount;
			type = parsedAmt.isNegative ? 'expense' : 'income';
		}

		transactions.push({
			id: crypto.randomUUID(),
			date: parsedDate,
			description,
			rawAmount,
			amount,
			type,
		});
	}

	return transactions;
}
