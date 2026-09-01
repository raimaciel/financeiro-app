import { normalizeText } from './categoryRules';

export interface TransactionForDetection {
	id: number | string;
	description?: string | null;
	amount: number;
	type: 'income' | 'expense';
	date: string; // YYYY-MM-DD
	category_id?: number | null;
	credit_card_id?: string | null;
}

export interface SuggestedRecurring {
	id: string; // Unique suggestion ID
	description: string;
	amount: number;
	type: 'income' | 'expense';
	frequency: 'monthly' | 'weekly' | 'yearly';
	day_of_month: number;
	category_id: number | null;
	credit_card_id: string | null;
	confidence: 'high' | 'medium';
	occurrencesCount: number;
	sampleDates: string[];
	explanation: string;
}

/**
 * Remove números, parcelas, datas e códigos variáveis de descrições para agrupamento.
 * Ex: "NETFLIX.COM 1234" -> "NETFLIX.COM", "UBER *TRIP 02/05" -> "UBER TRIP"
 */
function cleanPatternDescription(desc: string): string {
	return normalizeText(desc)
		.replace(/(?:PARC|PARCELA)?[.\s]*\(?\d{1,2}\s*(?:\/|\s+DE\s+)\s*\d{1,2}\)?/gi, '')
		.replace(/\b\d{6,}\b/g, '') // remove números longos de autorização/NSU
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/**
 * Analisa as transações do workspace e sugere recorrências encontradas com base em padrões de data e valor.
 */
export function detectRecurringPatterns(transactions: TransactionForDetection[]): SuggestedRecurring[] {
	if (!transactions || transactions.length < 2) {
		return [];
	}

	// 1. Agrupa transações por chave normalizada (descrição limpa + tipo)
	const groups: Record<string, TransactionForDetection[]> = {};

	for (const tx of transactions) {
		const rawDesc = tx.description || 'Sem Descrição';
		const cleanKey = `${cleanPatternDescription(rawDesc)}_${tx.type}`;

		if (!groups[cleanKey]) {
			groups[cleanKey] = [];
		}
		groups[cleanKey].push(tx);
	}

	const suggestions: SuggestedRecurring[] = [];

	// 2. Analisa cada grupo com 2 ou mais transações
	for (const key of Object.keys(groups)) {
		const items = groups[key];
		if (items.length < 2) continue;

		// Ordena cronologicamente
		items.sort((a, b) => a.date.localeCompare(b.date));

		// Coleta meses distintos em que a transação ocorreu
		const monthsSet = new Set(items.map((it) => it.date.slice(0, 7))); // YYYY-MM
		if (monthsSet.size < 2) {
			// Não é recorrente se ocorreu várias vezes apenas no mesmo mês (ex: compras diárias de supermercado)
			continue;
		}

		// Extrai dias do mês
		const days = items.map((it) => parseInt(it.date.split('-')[2], 10));
		const minDay = Math.min(...days);
		const maxDay = Math.max(...days);

		// Tolerância para o dia do mês (+/- 5 dias para compensações de fim de semana/feriado)
		const daySpread = maxDay - minDay;
		if (daySpread > 10 && items.length <= 3) {
			// Dias muito dispersos em poucas ocorrências indicam compras avulsas
			continue;
		}

		// Média do dia do mês mais frequente (ou mediana)
		const dayCounts: Record<number, number> = {};
		for (const d of days) {
			dayCounts[d] = (dayCounts[d] || 0) + 1;
		}
		const mostFrequentDay = parseInt(
			Object.keys(dayCounts).reduce((a, b) => (dayCounts[Number(a)] >= dayCounts[Number(b)] ? a : b)),
			10
		);

		// Analisa variação de valores
		const amounts = items.map((it) => Math.abs(it.amount));
		const minAmount = Math.min(...amounts);
		const maxAmount = Math.max(...amounts);

		// Variação de valor: se a diferença máxima for menor que 20% (ou diferença menor que R$ 30)
		const isValueConsistent = maxAmount === 0 || minAmount / maxAmount >= 0.75 || maxAmount - minAmount <= 35;
		if (!isValueConsistent) {
			continue;
		}

		// Valor sugerido: média aritmética ou o valor mais recente
		const latestItem = items[items.length - 1];
		const avgAmount = amounts.reduce((acc, v) => acc + v, 0) / amounts.length;
		const suggestedAmount = Number(latestItem.amount ? latestItem.amount.toFixed(2) : avgAmount.toFixed(2));

		// Descrição mais limpa e representativa
		const bestDescription = latestItem.description || items[0].description || 'Transação Recorrente';

		// Categoria mais frequente no grupo
		const categoryCounts: Record<number, number> = {};
		for (const it of items) {
			if (it.category_id) {
				categoryCounts[it.category_id] = (categoryCounts[it.category_id] || 0) + 1;
			}
		}
		let bestCategoryId: number | null = null;
		if (Object.keys(categoryCounts).length > 0) {
			bestCategoryId = parseInt(
				Object.keys(categoryCounts).reduce((a, b) =>
					categoryCounts[Number(a)] >= categoryCounts[Number(b)] ? a : b
				),
				10
			);
		}

		// Cartão de crédito mais frequente
		const cardCounts: Record<string, number> = {};
		for (const it of items) {
			if (it.credit_card_id) {
				cardCounts[it.credit_card_id] = (cardCounts[it.credit_card_id] || 0) + 1;
			}
		}
		let bestCardId: string | null = null;
		if (Object.keys(cardCounts).length > 0) {
			bestCardId = Object.keys(cardCounts).reduce((a, b) =>
				cardCounts[a] >= cardCounts[b] ? a : b
			);
		}

		const isHighConfidence = monthsSet.size >= 3 && daySpread <= 4;
		const confidence = isHighConfidence ? 'high' : 'medium';

		const sampleDates = items.map((it) => it.date);
		const explanation = `Identificado em ${monthsSet.size} meses distintos (dia ~${mostFrequentDay}, valor R$ ${suggestedAmount.toFixed(2)})`;

		suggestions.push({
			id: crypto.randomUUID(),
			description: bestDescription,
			amount: suggestedAmount,
			type: latestItem.type,
			frequency: 'monthly',
			day_of_month: mostFrequentDay,
			category_id: bestCategoryId,
			credit_card_id: bestCardId,
			confidence,
			occurrencesCount: items.length,
			sampleDates: sampleDates.slice(-5), // últimas 5 ocorrências
			explanation,
		});
	}

	// Ordena por confiança e número de ocorrências
	suggestions.sort((a, b) => {
		if (a.confidence === 'high' && b.confidence !== 'high') return -1;
		if (b.confidence === 'high' && a.confidence !== 'high') return 1;
		return b.occurrencesCount - a.occurrencesCount;
	});

	return suggestions;
}
