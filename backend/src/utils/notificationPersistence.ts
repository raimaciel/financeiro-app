export interface PersistedNotification {
	id: string;
	workspace_id: string;
	user_id: string;
	type: string;
	title: string;
	message: string;
	related_entity_type: string | null;
	related_entity_id: string | null;
	is_read: number;
	created_at: string;
	severity?: 'danger' | 'warning' | 'info';
	related_link?: string;
}

export interface CreateNotificationInput {
	workspaceId: string;
	userId: string;
	type: string;
	title: string;
	message: string;
	relatedEntityType?: string | null;
	relatedEntityId?: string | null;
	createdAt?: string;
}

export function getNotificationLinkAndSeverity(
	type: string,
	relatedEntityType?: string | null
): { related_link: string; severity: 'danger' | 'warning' | 'info' } {
	let related_link = '/dashboard';
	let severity: 'danger' | 'warning' | 'info' = 'info';

	if (type === 'invoice_overdue' || type === 'budget_exceeded') {
		severity = 'danger';
	} else if (
		type === 'invoice_due' ||
		type === 'low_balance' ||
		type === 'budget_warning' ||
		type === 'goal_deadline_near' ||
		type === 'invoice_due_soon'
	) {
		severity = 'warning';
	}

	if (relatedEntityType === 'invoice' || type.startsWith('invoice_')) {
		related_link = '/credit-cards';
	} else if (relatedEntityType === 'account' || type === 'low_balance') {
		related_link = '/accounts';
	} else if (relatedEntityType === 'transaction' || type === 'transfer_completed') {
		related_link = '/transfers';
	} else if (type.startsWith('budget_') || type.startsWith('goal_')) {
		related_link = '/budgets';
	} else if (type.startsWith('recurring_')) {
		related_link = '/recurring';
	} else if (type === 'import_reminder') {
		related_link = '/import';
	}

	return { related_link, severity };
}

export async function createNotification(
	db: D1Database,
	input: CreateNotificationInput
): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	const createdAt = input.createdAt || new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO notifications (id, workspace_id, user_id, type, title, message, related_entity_type, related_entity_id, is_read, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
		)
		.bind(
			id,
			input.workspaceId,
			input.userId,
			input.type,
			input.title,
			input.message,
			input.relatedEntityType || null,
			input.relatedEntityId || null,
			createdAt
		)
		.run();
	return { id };
}

export interface CandidateNotification {
	type: string;
	title: string;
	message: string;
	related_entity_type: string;
	related_entity_id: string;
}

export async function generateAndPersistNotifications(
	db: D1Database,
	workspaceId: string,
	userId: string,
	currentDate: Date = new Date(),
	options?: { lowBalanceThreshold?: number }
): Promise<number> {
	const lowBalanceThreshold = options?.lowBalanceThreshold ?? 100;
	const candidates: CandidateNotification[] = [];

	const todayISO = currentDate.toISOString().slice(0, 10);
	const todayMidnight = new Date(todayISO + 'T00:00:00Z').getTime();

	// 1. Faturas próximas do vencimento (<= 3 dias) ou vencidas (status != 'paid')
	try {
		const invoicesResult = await db
			.prepare(`
				SELECT 
					i.id,
					i.credit_card_id,
					i.workspace_id,
					i.reference_month,
					i.closing_date,
					i.due_date,
					i.total_amount,
					i.status,
					cc.name as card_name
				FROM invoices i
				LEFT JOIN credit_cards cc ON cc.id = i.credit_card_id
				WHERE (i.workspace_id = ? OR cc.workspace_id = ?) AND (i.status != 'paid' OR i.status IS NULL)
			`)
			.bind(workspaceId, workspaceId)
			.all<any>();

		const rawInvoices = invoicesResult?.results || [];
		const invoices = rawInvoices.filter((inv: any) => {
			const wsMatch = !inv.workspace_id || String(inv.workspace_id) === String(workspaceId);
			const notPaid = inv.status !== 'paid';
			return wsMatch && notPaid;
		});

		for (const inv of invoices) {
			if (!inv.due_date) continue;
			const dueISO = String(inv.due_date).slice(0, 10);
			const dueMidnight = new Date(dueISO + 'T00:00:00Z').getTime();
			const diffDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
			const cardName = inv.card_name || 'Cartão';
			const amount = Number(inv.total_amount || 0);

			if (diffDays < 0) {
				candidates.push({
					type: 'invoice_overdue',
					title: `Fatura vencida: ${cardName}`,
					message: `A fatura no valor de R$ ${amount.toFixed(2)} venceu em ${dueISO}.`,
					related_entity_type: 'invoice',
					related_entity_id: String(inv.id),
				});
			} else if (diffDays <= 3) {
				const daysMsg = diffDays === 0 ? 'vence hoje' : `vence em ${diffDays} dia(s)`;
				candidates.push({
					type: 'invoice_due',
					title: `Fatura próxima do vencimento: ${cardName}`,
					message: `A fatura no valor de R$ ${amount.toFixed(2)} ${daysMsg} (${dueISO}).`,
					related_entity_type: 'invoice',
					related_entity_id: String(inv.id),
				});
			}
		}
	} catch (err) {
		console.error('[generateAndPersistNotifications] Erro ao verificar faturas:', err);
	}

	// 2. Contas bancárias com saldo baixo (< R$ 100)
	try {
		const accountsResult = await db
			.prepare(`
				SELECT 
					ba.id, 
					ba.name, 
					ba.bank_name, 
					ba.initial_balance,
					COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
					COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense,
					COALESCE((SELECT SUM(amount) FROM account_transfers WHERE from_account_id = ba.id AND workspace_id = ba.workspace_id), 0) as total_transfers_out,
					COALESCE((SELECT SUM(amount) FROM account_transfers WHERE to_account_id = ba.id AND workspace_id = ba.workspace_id), 0) as total_transfers_in,
					COALESCE((SELECT SUM(total_amount) FROM invoices WHERE payment_account_id = ba.id AND status = 'paid' AND workspace_id = ba.workspace_id), 0) as total_invoices_paid
				FROM bank_accounts ba
				LEFT JOIN transactions t ON t.account_id = ba.id AND t.workspace_id = ba.workspace_id
				WHERE ba.workspace_id = ? AND (ba.status = 'active' OR ba.status IS NULL)
				GROUP BY ba.id, ba.name, ba.bank_name, ba.initial_balance
			`)
			.bind(workspaceId)
			.all<any>();

		const accounts = accountsResult?.results || [];
		for (const acc of accounts) {
			const initialBal = Number(acc.initial_balance || 0);
			const income = Number(acc.total_income || 0);
			const expense = Number(acc.total_expense || 0);
			const out = Number(acc.total_transfers_out || 0);
			const incoming = Number(acc.total_transfers_in || 0);
			const invoicesPaid = Number(acc.total_invoices_paid || 0);
			const currentBal = Number((initialBal + income - expense - out + incoming - invoicesPaid).toFixed(2));

			if (currentBal < lowBalanceThreshold) {
				candidates.push({
					type: 'low_balance',
					title: `Saldo baixo: ${acc.name}`,
					message: `A conta ${acc.name} está com saldo de R$ ${currentBal.toFixed(2)}, abaixo do limite de alerta.`,
					related_entity_type: 'account',
					related_entity_id: String(acc.id),
				});
			}
		}
	} catch (err) {
		console.error('[generateAndPersistNotifications] Erro ao verificar contas bancárias:', err);
	}

	// 3. Orçamentos excedidos ou em alerta
	try {
		const currentMonth = todayISO.slice(0, 7);
		const monthStart = `${currentMonth}-01`;
		const monthEnd = `${currentMonth}-31`;

		const budgetsResult = await db
			.prepare(`
				SELECT b.id, b.workspace_id, b.category_id, b.monthly_limit, b.alert_threshold_percent, c.name as category_name
				FROM budgets b
				LEFT JOIN categories c ON c.id = b.category_id
				WHERE b.workspace_id = ?
			`)
			.bind(workspaceId)
			.all<any>();

		const budgets = budgetsResult?.results || [];
		if (budgets.length > 0) {
			const expensesResult = await db
				.prepare(`
					SELECT category_id, SUM(amount) as total_spent
					FROM transactions
					WHERE workspace_id = ? AND type = 'expense' AND date >= ? AND date <= ?
					GROUP BY category_id
				`)
				.bind(workspaceId, monthStart, monthEnd)
				.all<any>();

			const expensesByCategory: Record<number, number> = {};
			(expensesResult?.results || []).forEach((row: any) => {
				if (row.category_id) {
					expensesByCategory[row.category_id] = Number(row.total_spent || row.amount || 0);
				}
			});

			for (const budget of budgets) {
				const limit = Number(budget.monthly_limit || 0);
				if (limit <= 0) continue;
				const spent = Number(expensesByCategory[budget.category_id] || 0);
				const percentage = (spent / limit) * 100;
				const threshold = Number(budget.alert_threshold_percent || 80);
				const catName = budget.category_name || 'Categoria';

				if (percentage >= 100) {
					candidates.push({
						type: 'budget_exceeded',
						title: `Orçamento Excedido: ${catName}`,
						message: `O limite de R$ ${limit.toFixed(2)} foi ultrapassado (${percentage.toFixed(1)}% utilizado).`,
						related_entity_type: 'budget',
						related_entity_id: String(budget.id),
					});
				} else if (percentage >= threshold) {
					candidates.push({
						type: 'budget_warning',
						title: `Atenção ao Orçamento: ${catName}`,
						message: `Você atingiu ${percentage.toFixed(1)}% do limite de R$ ${limit.toFixed(2)}.`,
						related_entity_type: 'budget',
						related_entity_id: String(budget.id),
					});
				}
			}
		}
	} catch (err) {
		console.error('[generateAndPersistNotifications] Erro ao verificar orçamentos:', err);
	}

	// 4. Inserir candidatos evitando duplicatas não lidas nas últimas 24h
	const twentyFourHoursAgo = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
	let insertedCount = 0;

	for (const cand of candidates) {
		try {
			const existing = await db
				.prepare(`
					SELECT id FROM notifications 
					WHERE workspace_id = ? 
						AND user_id = ? 
						AND type = ? 
						AND related_entity_type = ? 
						AND related_entity_id = ? 
						AND is_read = 0 
						AND created_at >= ?
					LIMIT 1
				`)
				.bind(
					workspaceId,
					userId,
					cand.type,
					cand.related_entity_type,
					cand.related_entity_id,
					twentyFourHoursAgo
				)
				.first<{ id: string }>();

			if (!existing) {
				await createNotification(db, {
					workspaceId,
					userId,
					type: cand.type,
					title: cand.title,
					message: cand.message,
					relatedEntityType: cand.related_entity_type,
					relatedEntityId: cand.related_entity_id,
					createdAt: currentDate.toISOString(),
				});
				insertedCount++;
			}
		} catch (err) {
			console.error('[generateAndPersistNotifications] Erro ao persistir candidato:', err);
		}
	}

	return insertedCount;
}
