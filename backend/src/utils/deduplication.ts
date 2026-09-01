import { normalizeText } from './categoryRules';

export interface ExistingTransactionRef {
	id: number | string;
	date: string;
	amount: number;
	description?: string | null;
	type?: string;
}

export interface DeduplicationResult {
	duplicateHash: string;
	isPossibleDuplicate: boolean;
	duplicateReason: string | null;
	matchedTransactionId: number | string | null;
}

/**
 * Gera um hash determinístico para identificar duplicatas com base em data, valor e descrição normalizada.
 */
export function generateDuplicateHash(date: string, amount: number, description: string): string {
	const cleanDesc = normalizeText(description).replace(/[^A-Z0-9]/g, '');
	const absAmount = Math.abs(amount).toFixed(2);
	return `${date}_${absAmount}_${cleanDesc}`;
}

/**
 * Calcula a similaridade entre duas strings (coeficiente de sobreposição de tokens).
 */
function textSimilarity(a: string, b: string): number {
	const normA = normalizeText(a);
	const normB = normalizeText(b);

	if (normA === normB) return 1.0;
	if (!normA || !normB) return 0.0;
	if (normA.includes(normB) || normB.includes(normA)) return 0.9;

	const tokensA = new Set(normA.split(/\s+/).filter((t) => t.length > 2));
	const tokensB = new Set(normB.split(/\s+/).filter((t) => t.length > 2));

	if (tokensA.size === 0 || tokensB.size === 0) return 0;

	let intersection = 0;
	for (const t of tokensA) {
		if (tokensB.has(t)) intersection++;
	}

	return (2 * intersection) / (tokensA.size + tokensB.size);
}

/**
 * Verifica se um item importado é uma possível duplicata de alguma transação já existente no banco de dados.
 */
export function checkDuplicate(
	item: { date: string; amount: number; description: string; type?: string },
	existingTransactions: ExistingTransactionRef[]
): DeduplicationResult {
	const hash = generateDuplicateHash(item.date, item.amount, item.description);
	const itemAmount = Number(Math.abs(item.amount).toFixed(2));

	for (const existing of existingTransactions) {
		const existingAmount = Number(Math.abs(existing.amount).toFixed(2));

		// 1. Match exato de data e valor
		if (existing.date === item.date && existingAmount === itemAmount) {
			const existingDesc = existing.description || '';
			const similarity = textSimilarity(item.description, existingDesc);

			// Se a descrição for muito similar ou ambas estiverem vazias / match exato
			if (similarity >= 0.5 || !existingDesc || !item.description) {
				return {
					duplicateHash: hash,
					isPossibleDuplicate: true,
					duplicateReason: `Transação similar já cadastrada em ${existing.date} (R$ ${existingAmount.toFixed(2)} - "${existingDesc || 'Sem descrição'}")`,
					matchedTransactionId: existing.id,
				};
			}
		}

		// 2. Match de tolerância de 1 dia (fuso horário bancário de compensação) com descrição idêntica
		const itemDateObj = new Date(item.date).getTime();
		const existingDateObj = new Date(existing.date).getTime();
		const diffDays = Math.abs(itemDateObj - existingDateObj) / (1000 * 60 * 60 * 24);

		if (diffDays <= 1 && existingAmount === itemAmount) {
			const existingDesc = existing.description || '';
			const similarity = textSimilarity(item.description, existingDesc);

			if (similarity >= 0.85) {
				return {
					duplicateHash: hash,
					isPossibleDuplicate: true,
					duplicateReason: `Possível duplicata por data próxima (${existing.date}) e valor idêntico (R$ ${existingAmount.toFixed(2)})`,
					matchedTransactionId: existing.id,
				};
			}
		}
	}

	return {
		duplicateHash: hash,
		isPossibleDuplicate: false,
		duplicateReason: null,
		matchedTransactionId: null,
	};
}
