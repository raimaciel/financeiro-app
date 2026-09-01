import { calculateInvoicePeriod, getInvoiceMonthForTransaction, formatDateISO } from './invoiceCalculator';
import { calculatePendingDates, type RecurringRule } from './recurringGenerator';

export type NotificationType =
	| 'budget_warning'
	| 'budget_exceeded'
	| 'invoice_due_soon'
	| 'goal_achieved'
	| 'goal_deadline_near'
	| 'recurring_pending'
	| 'import_reminder';

export type NotificationSeverity = 'danger' | 'warning' | 'info';

export interface NotificationItem {
	id: string; // ID determinístico para controle de lida/não lida no frontend
	type: NotificationType;
	title: string;
	message: string;
	severity: NotificationSeverity;
	related_link: string;
	created_context_date: string; // YYYY-MM-DD
}

export interface NotificationGeneratorOptions {
	workspaceId: string;
	budgets?: any[];
	expensesByCategory?: Record<number, number>;
	creditCards?: any[];
	cardInvoices?: any[];
	savingsGoals?: any[];
	recurringRules?: RecurringRule[];
	lastTransactionDate?: string | null;
	currentDate?: Date;
}

/**
 * Gera em tempo real a lista de notificações e alertas ativos para o workspace.
 */
export function generateWorkspaceNotifications(options: NotificationGeneratorOptions): NotificationItem[] {
	const {
		workspaceId,
		budgets = [],
		expensesByCategory = {},
		creditCards = [],
		cardInvoices = [],
		savingsGoals = [],
		recurringRules = [],
		lastTransactionDate = null,
		currentDate = new Date(),
	} = options;

	const notifications: NotificationItem[] = [];
	const todayISO = formatDateISO(currentDate);
	const currentMonth = todayISO.slice(0, 7); // YYYY-MM

	// 1. Alertas de Orçamento (Budget Warning / Exceeded)
	for (const budget of budgets) {
		const limit = Number(budget.monthly_limit || 0);
		if (limit <= 0) continue;

		const spent = Number(expensesByCategory[budget.category_id] || 0);
		const percentageUsed = (spent / limit) * 100;
		const threshold = Number(budget.alert_threshold_percent || 80);
		const catName = budget.category_name || 'Categoria';

		if (percentageUsed >= 100) {
			const diff = spent - limit;
			notifications.push({
				id: `budget_exceeded_${budget.id}_${currentMonth}`,
				type: 'budget_exceeded',
				title: `Orçamento Excedido: ${catName}`,
				message: `O limite de R$ ${limit.toFixed(2)} foi ultrapassado em R$ ${diff.toFixed(2)} (${percentageUsed.toFixed(1)}% utilizado).`,
				severity: 'danger',
				related_link: '/budgets',
				created_context_date: todayISO,
			});
		} else if (percentageUsed >= threshold) {
			const remaining = limit - spent;
			notifications.push({
				id: `budget_warning_${budget.id}_${currentMonth}`,
				type: 'budget_warning',
				title: `Atenção ao Orçamento: ${catName}`,
				message: `Você atingiu ${percentageUsed.toFixed(1)}% do orçamento. Restam apenas R$ ${remaining.toFixed(2)}.`,
				severity: 'warning',
				related_link: '/budgets',
				created_context_date: todayISO,
			});
		}
	}

	// 2. Faturas de Cartão de Crédito Próximas do Vencimento
	const paidInvoicesMap = new Set(
		cardInvoices.filter((inv) => inv.status === 'paid').map((inv) => `${inv.credit_card_id}_${inv.reference_month}`)
	);

	for (const card of creditCards) {
		const closingDay = Number(card.closing_day || 25);
		const dueDay = Number(card.due_day || 5);
		const [curY, curM] = todayISO.split('-').map(Number);
		const monthsToCheck = [
			`${curY}-${String(curM).padStart(2, '0')}`,
			curM === 1 ? `${curY - 1}-12` : `${curY}-${String(curM - 1).padStart(2, '0')}`,
		];

		for (const refMonth of monthsToCheck) {
			const period = calculateInvoicePeriod(closingDay, dueDay, refMonth, currentDate);
			const isPaid = paidInvoicesMap.has(`${card.id}_${refMonth}`);

			if (!isPaid && period.days_until_due <= 3 && period.days_until_due >= -30) {
				let severity: NotificationSeverity = 'warning';
				let title = `Fatura do ${card.name} Vence em Breve`;
				let message = `A fatura vence no dia ${period.due_date} (faltam ${period.days_until_due} dia(s)).`;

				if (period.days_until_due < 0) {
					severity = 'danger';
					title = `Fatura do ${card.name} Vencida!`;
					message = `A fatura venceu em ${period.due_date} e ainda não foi registrada como paga.`;
				} else if (period.days_until_due === 0) {
					severity = 'danger';
					title = `Fatura do ${card.name} Vence Hoje!`;
					message = `A fatura vence hoje (${period.due_date}). Evite encargos e juros.`;
				}

				notifications.push({
					id: `invoice_due_${card.id}_${refMonth}`,
					type: 'invoice_due_soon',
					title,
					message,
					severity,
					related_link: '/credit-cards',
					created_context_date: period.due_date,
				});
			}
		}
	}

	// 3. Metas de Economia (Goal Achieved / Deadline Near)
	for (const goal of savingsGoals) {
		const target = Number(goal.target_amount || 0);
		const current = Number(goal.current_amount || 0);
		const progress = target > 0 ? (current / target) * 100 : 0;

		if (goal.status === 'completed' || progress >= 100) {
			notifications.push({
				id: `goal_achieved_${goal.id}`,
				type: 'goal_achieved',
				title: `Meta Concluída: ${goal.name}! 🎉`,
				message: `Parabéns! Você atingiu o objetivo de R$ ${target.toFixed(2)}.`,
				severity: 'info',
				related_link: '/budgets',
				created_context_date: todayISO,
			});
		} else if (goal.target_date && goal.status === 'active') {
			const targetDateObj = new Date(goal.target_date);
			const diffTime = targetDateObj.getTime() - currentDate.getTime();
			const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

			if (daysRemaining <= 7 && daysRemaining >= 0) {
				const missing = target - current;
				notifications.push({
					id: `goal_deadline_${goal.id}`,
					type: 'goal_deadline_near',
					title: `Prazo da Meta Próximo: ${goal.name}`,
					message: `Faltam ${daysRemaining} dia(s) para o prazo e ainda faltam R$ ${missing.toFixed(2)} (${progress.toFixed(1)}% guardado).`,
					severity: 'warning',
					related_link: '/budgets',
					created_context_date: goal.target_date,
				});
			}
		}
	}

	// 4. Recorrências Pendentes de Geração
	let pendingRecurringCount = 0;
	for (const rule of recurringRules) {
		if (rule.status === 'active') {
			const dates = calculatePendingDates(rule, todayISO);
			if (dates.length > 0) {
				pendingRecurringCount += dates.length;
			}
		}
	}

	if (pendingRecurringCount > 0) {
		notifications.push({
			id: `recurring_pending_${workspaceId}_${todayISO}`,
			type: 'recurring_pending',
			title: 'Lançamentos Recorrentes Pendentes',
			message: `Existem ${pendingRecurringCount} transação(ões) recorrente(s) aguardando geração automática.`,
			severity: 'info',
			related_link: '/recurring',
			created_context_date: todayISO,
		});
	}

	// 5. Lembrete de Importação Mensal (se última transação > 30 dias)
	if (lastTransactionDate) {
		const lastTxDateObj = new Date(lastTransactionDate);
		const diffTime = currentDate.getTime() - lastTxDateObj.getTime();
		const daysSinceLastTx = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		if (daysSinceLastTx >= 30) {
			notifications.push({
				id: `import_reminder_${workspaceId}_${currentMonth}`,
				type: 'import_reminder',
				title: 'Lembrete de Conciliação Bancária',
				message: `Faz ${daysSinceLastTx} dias desde seu último lançamento registrado. Que tal importar o extrato OFX/CSV deste mês?`,
				severity: 'info',
				related_link: '/import',
				created_context_date: todayISO,
			});
		}
	}

	// Ordenação por severidade (danger -> warning -> info) e data DESC
	const severityWeight: Record<NotificationSeverity, number> = {
		danger: 1,
		warning: 2,
		info: 3,
	};

	notifications.sort((a, b) => {
		const weightDiff = severityWeight[a.severity] - severityWeight[b.severity];
		if (weightDiff !== 0) return weightDiff;
		return b.created_context_date.localeCompare(a.created_context_date);
	});

	return notifications;
}
