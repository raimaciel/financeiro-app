export interface RawImportTransaction {
	id: string;
	date: string; // YYYY-MM-DD
	description: string;
	rawAmount: number;
	amount: number; // positive float
	type: 'income' | 'expense';
	fitid?: string;
	memo?: string;
}

/**
 * Normaliza datas do formato OFX (ex: 20260815, 20260815120000, 20260815120000[-03:EST], 2026-08-15)
 * para o formato padrão ISO YYYY-MM-DD.
 */
export function parseOfxDate(dateStr: string): string {
	if (!dateStr) {
		const now = new Date();
		return now.toISOString().slice(0, 10);
	}

	const cleaned = dateStr.trim();

	// Se já for YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
		return cleaned;
	}

	// Se começar com YYYYMMDD (ex: 20260815...)
	const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})/);
	if (match) {
		const [, year, month, day] = match;
		return `${year}-${month}-${day}`;
	}

	// Formato DD/MM/YYYY
	const matchBr = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	if (matchBr) {
		const [, day, month, year] = matchBr;
		return `${year}-${month}-${day}`;
	}

	return new Date().toISOString().slice(0, 10);
}

/**
 * Decodifica entidades HTML/SGML comuns em arquivos OFX.
 */
function cleanOfxText(text: string): string {
	if (!text) return '';
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Parser de arquivos OFX (compatível com SGML OFX 1.x e XML OFX 2.x).
 * Extrai todos os blocos <STMTTRN>...</STMTTRN>.
 */
export function parseOFX(ofxContent: string): RawImportTransaction[] {
	if (!ofxContent || typeof ofxContent !== 'string') {
		return [];
	}

	const transactions: RawImportTransaction[] = [];

	// Localiza blocos STMTTRN (case-insensitive)
	const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>)|(?=<\/CCSTMTTRNRS>)|(?=<\/STMTRS>)|$)/gi;

	let match: RegExpExecArray | null;

	while ((match = stmtTrnRegex.exec(ofxContent)) !== null) {
		const block = match[1];
		if (!block || block.trim().length === 0) continue;

		// Extrai tags comuns do bloco
		const getTagValue = (tagName: string): string => {
			const tagRegex = new RegExp(`<${tagName}>([^<\\r\\n]+)(?:<\\/${tagName}>)?`, 'i');
			const tagMatch = block.match(tagRegex);
			return tagMatch ? tagMatch[1].trim() : '';
		};

		const trnType = getTagValue('TRNTYPE').toUpperCase();
		const dtPostedRaw = getTagValue('DTPOSTED');
		const trnAmtRaw = getTagValue('TRNAMT');
		const fitid = getTagValue('FITID') || undefined;
		const memo = cleanOfxText(getTagValue('MEMO'));
		const name = cleanOfxText(getTagValue('NAME'));
		const payee = cleanOfxText(getTagValue('PAYEE'));

		const description = memo || name || payee || 'Transação Importada (OFX)';
		const date = parseOfxDate(dtPostedRaw);

		// Converte valor monetário
		let rawAmount = 0;
		if (trnAmtRaw) {
			// Substitui vírgula por ponto se necessário
			const normalizedAmt = trnAmtRaw.replace(',', '.').replace(/[^\d.-]/g, '');
			rawAmount = parseFloat(normalizedAmt) || 0;
		}

		if (rawAmount === 0 && !trnAmtRaw) {
			continue;
		}

		// Determina se é despesa ou receita
		// No OFX: valores negativos são débitos/despesas; positivos são créditos/receitas
		const isExpense = rawAmount < 0 || trnType === 'DEBIT' || trnType === 'PAYMENT' || trnType === 'FEE' || trnType === 'POS';
		const amount = Math.abs(rawAmount);
		const type: 'income' | 'expense' = isExpense ? 'expense' : 'income';

		transactions.push({
			id: fitid || crypto.randomUUID(),
			date,
			description,
			rawAmount,
			amount: Number(amount.toFixed(2)),
			type,
			fitid,
			memo: memo || undefined,
		});
	}

	return transactions;
}
