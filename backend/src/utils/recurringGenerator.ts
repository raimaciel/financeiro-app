export interface RecurringRule {
	id: string;
	workspace_id: string;
	user_id: number | string;
	description: string;
	amount: number;
	type: 'income' | 'expense';
	category_id?: number | null;
	credit_card_id?: string | null;
	frequency: 'monthly' | 'weekly' | 'yearly';
	day_of_month?: number | null;
	day_of_week?: number | null;
	start_date: string; // YYYY-MM-DD
	end_date?: string | null; // YYYY-MM-DD
	status: 'active' | 'paused' | 'cancelled';
	last_generated_date?: string | null; // YYYY-MM-DD
}

export interface GeneratedTransactionPayload {
	workspace_id: string;
	user_id: number | string;
	category_id: number | null;
	credit_card_id: string | null;
	type: 'income' | 'expense';
	description: string;
	amount: number;
	installments: number;
	installment_current: number;
	date: string; // YYYY-MM-DD
	recurring_id: string;
}

/**
 * Retorna o último dia de um determinado ano e mês (1-indexed).
 */
function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

/**
 * Calcula todas as datas pendentes de geração para uma regra de recorrência mensal até uma data limite.
 */
export function calculatePendingDates(
	rule: RecurringRule,
	targetDateStr: string = new Date().toISOString().slice(0, 10)
): string[] {
	if (rule.status !== 'active') {
		return [];
	}

	const pendingDates: string[] = [];
	const startParts = rule.start_date.split('-');
	const targetParts = targetDateStr.split('-');

	if (startParts.length !== 3 || targetParts.length !== 3) {
		return [];
	}

	const startYear = parseInt(startParts[0], 10);
	const startMonth = parseInt(startParts[1], 10); // 1-12

	const targetYear = parseInt(targetParts[0], 10);
	const targetMonth = parseInt(targetParts[1], 10);

	const dayOfMonth = rule.day_of_month || parseInt(startParts[2], 10) || 1;
	const lastGen = rule.last_generated_date || '';

	let currentYear = startYear;
	let currentMonth = startMonth;

	// Itera mês a mês desde o mês inicial até o mês alvo
	while (
		currentYear < targetYear ||
		(currentYear === targetYear && currentMonth <= targetMonth)
	) {
		const maxDays = getDaysInMonth(currentYear, currentMonth);
		const safeDay = Math.min(dayOfMonth, maxDays);

		const yyyy = currentYear;
		const mm = String(currentMonth).padStart(2, '0');
		const dd = String(safeDay).padStart(2, '0');
		const candidateDate = `${yyyy}-${mm}-${dd}`;

		// Verifica se a data:
		// 1. É maior ou igual à data de início
		// 2. É menor ou igual à data limite (targetDate)
		// 3. É menor ou igual à data de fim (se houver)
		// 4. É estritamente maior que a última data já gerada (para não duplicar)
		const isAfterStart = candidateDate >= rule.start_date;
		const isBeforeTarget = candidateDate <= targetDateStr;
		const isBeforeEnd = !rule.end_date || candidateDate <= rule.end_date;
		const isAfterLastGen = !lastGen || candidateDate > lastGen;

		if (isAfterStart && isBeforeTarget && isBeforeEnd && isAfterLastGen) {
			pendingDates.push(candidateDate);
		}

		// Avança para o próximo mês
		currentMonth++;
		if (currentMonth > 12) {
			currentMonth = 1;
			currentYear++;
		}
	}

	return pendingDates;
}

/**
 * Prepara as transações que devem ser geradas a partir de uma regra de recorrência.
 */
export function generateTransactionsForRule(
	rule: RecurringRule,
	targetDateStr: string = new Date().toISOString().slice(0, 10)
): { transactions: GeneratedTransactionPayload[]; newLastGeneratedDate: string | null } {
	const dates = calculatePendingDates(rule, targetDateStr);
	if (dates.length === 0) {
		return { transactions: [], newLastGeneratedDate: rule.last_generated_date || null };
	}

	const transactions: GeneratedTransactionPayload[] = dates.map((date) => ({
		workspace_id: rule.workspace_id,
		user_id: rule.user_id,
		category_id: rule.category_id || null,
		credit_card_id: rule.credit_card_id || null,
		type: rule.type,
		description: rule.description,
		amount: Number(rule.amount.toFixed(2)),
		installments: 1,
		installment_current: 1,
		date,
		recurring_id: rule.id,
	}));

	const newLastGeneratedDate = dates[dates.length - 1];

	return {
		transactions,
		newLastGeneratedDate,
	};
}
