export interface InvoicePeriod {
	reference_month: string; // YYYY-MM
	year: number;
	month: number;
	start_date: string; // YYYY-MM-DD
	closing_date: string; // YYYY-MM-DD
	due_date: string; // YYYY-MM-DD
	status: 'open' | 'closed' | 'overdue';
	days_until_closing: number;
	days_until_due: number;
	is_closed_by_date: boolean;
}

export interface ForecastItem {
	transaction_id: string | number;
	description: string;
	amount: number;
	installments: number;
	installment_current: number;
	category_name?: string | null;
	category_color?: string | null;
	original_date: string;
}

export interface InvoiceForecastMonth {
	reference_month: string; // YYYY-MM
	month_label: string; // ex: "Outubro 2026"
	closing_date: string;
	due_date: string;
	days_until_due: number;
	predicted_total: number;
	installments_count: number;
	items: ForecastItem[];
}

/**
 * Retorna o último dia de um determinado ano e mês (1-indexed).
 */
export function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

/**
 * Retorna um objeto Date seguro ajustando o dia caso o mês tenha menos dias.
 */
export function getSafeDate(year: number, monthZeroIndexed: number, day: number): Date {
	const maxDay = new Date(year, monthZeroIndexed + 1, 0).getDate();
	const safeDay = Math.min(Math.max(1, day), maxDay);
	return new Date(year, monthZeroIndexed, safeDay);
}

/**
 * Formata um objeto Date para a string YYYY-MM-DD.
 */
export function formatDateISO(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calcula o período completo de uma fatura de cartão de crédito.
 * 
 * Regra padrão de mercado:
 * - A fatura do referenceMonth (ex: 2026-10) fecha no dia `closingDay` de referenceMonth (ex: 05/10/2026).
 * - O período de compras é de (dia seguinte ao fechamento anterior) até (dia de fechamento).
 *   Ex: se closingDay = 5, compras de 06/09 a 05/10 caem na fatura de 10/2026.
 * - O vencimento ocorre no `dueDay`. Se dueDay > closingDay, vence no mesmo mês do fechamento; se dueDay <= closingDay, vence no mês seguinte.
 */
export function calculateInvoicePeriod(
	closingDay: number,
	dueDay: number,
	referenceMonth: string,
	now: Date = new Date()
): InvoicePeriod {
	const [yStr, mStr] = referenceMonth.split('-');
	const year = parseInt(yStr, 10);
	const month = parseInt(mStr, 10); // 1-12

	// Data de fechamento da fatura deste mês
	const closingDate = getSafeDate(year, month - 1, closingDay);

	// Data de fechamento do mês anterior
	const prevClosingDate = getSafeDate(year, month - 2, closingDay);

	// Data de início do período: dia seguinte ao fechamento anterior
	const startDate = new Date(prevClosingDate);
	startDate.setDate(startDate.getDate() + 1);

	// Data de vencimento
	// Se o dia de vencimento for maior que o dia de fechamento, vence no mesmo mês do fechamento.
	// Se for menor ou igual, vence no mês subsequente.
	let dueYear = year;
	let dueMonth = month - 1; // zero-indexed
	if (dueDay <= closingDay) {
		dueMonth += 1;
		if (dueMonth > 11) {
			dueMonth = 0;
			dueYear += 1;
		}
	}
	const dueDate = getSafeDate(dueYear, dueMonth, dueDay);

	const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const diffClosing = closingDate.getTime() - todayMidnight.getTime();
	const daysUntilClosing = Math.ceil(diffClosing / (1000 * 60 * 60 * 24));

	const diffDue = dueDate.getTime() - todayMidnight.getTime();
	const daysUntilDue = Math.ceil(diffDue / (1000 * 60 * 60 * 24));

	const isClosed = todayMidnight > closingDate;
	let status: 'open' | 'closed' | 'overdue' = isClosed ? 'closed' : 'open';
	if (todayMidnight > dueDate) {
		status = 'overdue';
	}

	return {
		reference_month: referenceMonth,
		year,
		month,
		start_date: formatDateISO(startDate),
		closing_date: formatDateISO(closingDate),
		due_date: formatDateISO(dueDate),
		status,
		days_until_closing: daysUntilClosing,
		days_until_due: daysUntilDue,
		is_closed_by_date: isClosed,
	};
}

/**
 * Determina a qual fatura (reference_month) uma transação pertence com base na data da compra e no closing_day.
 */
export function getInvoiceMonthForTransaction(transactionDate: string, closingDay: number): string {
	const [yStr, mStr, dStr] = transactionDate.split('-');
	let year = parseInt(yStr, 10);
	let month = parseInt(mStr, 10);
	const day = parseInt(dStr, 10);

	// Se a compra foi feita após o dia de fechamento, cai na fatura do mês seguinte
	if (day > closingDay) {
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}

	return `${year}-${String(month).padStart(2, '0')}`;
}

const MONTH_NAMES = [
	'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
	'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Calcula a previsão de faturas futuras (forecast) para os próximos N meses com base nas transações parceladas.
 */
export function calculateInvoiceForecast(
	closingDay: number,
	dueDay: number,
	transactions: any[],
	monthsAhead: number = 6,
	startRefMonth?: string,
	now: Date = new Date()
): InvoiceForecastMonth[] {
	let currentRefMonth = startRefMonth;
	if (!currentRefMonth) {
		const currentISO = formatDateISO(now);
		currentRefMonth = getInvoiceMonthForTransaction(currentISO, closingDay);
	}

	const [startYearStr, startMonthStr] = currentRefMonth.split('-');
	const startYear = parseInt(startYearStr, 10);
	const startMonth = parseInt(startMonthStr, 10);

	// Gera lista dos próximos meses
	const targetMonths: string[] = [];
	for (let i = 0; i < monthsAhead; i++) {
		const d = new Date(startYear, startMonth - 1 + i, 1);
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		targetMonths.push(`${yyyy}-${mm}`);
	}

	// Mapeia transações para os meses
	const monthBuckets: Record<string, ForecastItem[]> = {};
	for (const m of targetMonths) {
		monthBuckets[m] = [];
	}

	for (const tx of transactions) {
		if (tx.type === 'expense' && tx.amount > 0) {
			const txRefMonth = getInvoiceMonthForTransaction(tx.date, closingDay);
			if (monthBuckets[txRefMonth]) {
				monthBuckets[txRefMonth].push({
					transaction_id: tx.id,
					description: tx.description || 'Lançamento sem descrição',
					amount: Number(tx.amount.toFixed(2)),
					installments: tx.installments || 1,
					installment_current: tx.installment_current || 1,
					category_name: tx.category_name || null,
					category_color: tx.category_color || null,
					original_date: tx.date,
				});
			}
		}
	}

	return targetMonths.map((refMonth) => {
		const period = calculateInvoicePeriod(closingDay, dueDay, refMonth, now);
		const items = monthBuckets[refMonth] || [];
		const total = items.reduce((acc, it) => acc + it.amount, 0);
		const [yStr, mStr] = refMonth.split('-');
		const mIdx = parseInt(mStr, 10) - 1;
		const monthLabel = `${MONTH_NAMES[mIdx]} ${yStr}`;

		return {
			reference_month: refMonth,
			month_label: monthLabel,
			closing_date: period.closing_date,
			due_date: period.due_date,
			days_until_due: period.days_until_due,
			predicted_total: Number(total.toFixed(2)),
			installments_count: items.filter((it) => it.installments > 1).length,
			items,
		};
	});
}
