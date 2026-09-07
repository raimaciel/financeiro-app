import { vi } from 'vitest';

/**
 * Cria um mock completo de D1Database para uso nos testes.
 * Simula prepare().bind().first() / run() / all() com dados configuráveis.
 */
export function createD1Mock(rows: Record<string, any[]> = {}) {
	if (!rows['notifications']) {
		rows['notifications'] = [];
	}
	if (!rows['budgets']) {
		rows['budgets'] = [];
	}
	if (!rows['financial_goals']) {
		rows['financial_goals'] = [];
	}
	const defaultRow = rows['default']?.[0] ?? null;
	// Ordena chaves pela mais longa primeiro para evitar que "transactions" intercepte "recurring_transactions"
	const sortedKeys = Object.keys(rows).sort((a, b) => b.length - a.length);

	const getTargetKey = (sql: string) => {
		const lowerSql = sql.toLowerCase();
		if (lowerSql.includes('notifications')) {
			return 'notifications';
		}
		if (lowerSql.includes('financial_goals')) {
			return 'financial_goals';
		}
		if (lowerSql.includes('savings_goals')) {
			return 'savings_goals';
		}
		if (lowerSql.includes('from budgets') || lowerSql.includes('into budgets') || lowerSql.includes('update budgets') || lowerSql.includes('delete from budgets')) {
			return 'budgets';
		}
		if (lowerSql.includes('from bank_accounts')) {
			return 'bank_accounts';
		}
		const fromMatch = lowerSql.match(/(?:from|into|update)\s+([a-z0-9_]+)/);
		if (fromMatch && fromMatch[1] && rows[fromMatch[1]]) {
			return fromMatch[1];
		}
		for (const key of sortedKeys) {
			if (lowerSql.includes(key.toLowerCase())) {
				return key;
			}
		}
		return null;
	};

	const buildStmt = (sql: string) => {
		const bindings: any[] = [];

		const stmt = {
			bind: (...args: any[]) => {
				bindings.push(...args);
				return stmt;
			},
			first: vi.fn(async () => {
				const key = getTargetKey(sql);
				if (key && rows[key]) {
					const lowerSql = sql.toLowerCase();
					if (key === 'notifications') {
						if (lowerSql.includes('count(*) as unread_count') || lowerSql.includes('count(*) as total') || lowerSql.includes('count(*)')) {
							let list = [...(rows['notifications'] || [])];
							if (bindings.length > 0) {
								const wsId = bindings[0];
								list = list.filter((n: any) => n.workspace_id === undefined || String(n.workspace_id) === String(wsId));
							}
							if (bindings.length > 1) {
								const uId = bindings[1];
								list = list.filter((n: any) => n.user_id === undefined || String(n.user_id) === String(uId));
							}
							if (lowerSql.includes('is_read = 0')) {
								list = list.filter((n: any) => Number(n.is_read || 0) === 0);
							}
							return { count: list.length, unread_count: list.length, total: list.length };
						}
						if (lowerSql.includes('select id from notifications') || lowerSql.includes('where workspace_id = ? and user_id = ? and type = ?')) {
							const list = rows['notifications'] || [];
							const found = list.find((n: any) => {
								const matchWs = !n.workspace_id || String(n.workspace_id) === String(bindings[0]);
								const matchUser = !n.user_id || String(n.user_id) === String(bindings[1]);
								const matchType = String(n.type) === String(bindings[2]);
								const matchRelType = String(n.related_entity_type) === String(bindings[3]);
								const matchRelId = String(n.related_entity_id) === String(bindings[4]);
								const matchRead = Number(n.is_read || 0) === 0;
								const matchDate = !n.created_at || !bindings[5] || n.created_at >= bindings[5];
								return matchWs && matchUser && matchType && matchRelType && matchRelId && matchRead && matchDate;
							});
							return found ?? null;
						}
						if (lowerSql.includes('where id = ? and workspace_id = ?')) {
							const idToFind = bindings[0];
							const wsToFind = bindings[1];
							const found = (rows['notifications'] || []).find((r: any) =>
								(r.id === undefined || String(r.id) === String(idToFind)) &&
								(r.workspace_id === undefined || String(r.workspace_id) === String(wsToFind))
							);
							return found ?? null;
						}
					}
					if (key === 'budgets' && lowerSql.includes('category_id = ?')) {
						const wsId = bindings[0];
						const catId = bindings[1];
						const monthToFind = bindings[2];
						const found = (rows['budgets'] || []).find((b: any) => {
							const matchWs = !b.workspace_id || String(b.workspace_id) === String(wsId);
							const matchCat = Number(b.category_id) === Number(catId);
							const bMonth = b.month || b.month_reference;
							const matchMonth = !monthToFind || bMonth === monthToFind;
							return matchWs && matchCat && matchMonth;
						});
						return found ?? null;
					}
					if (key === 'transactions' && lowerSql.includes('total_income') && (lowerSql.includes('sum(') || lowerSql.includes('count('))) {
						let filtered = [...rows['transactions']];
						if (lowerSql.includes('t.workspace_id = ?') && bindings.length > 0) {
							const ws = bindings[0];
							filtered = filtered.filter((t: any) => t.workspace_id === undefined || String(t.workspace_id) === String(ws));
						}
						// Check other filters
						let idx = 1;
						if (lowerSql.includes('t.date >= ?') && idx < bindings.length) {
							const start = bindings[idx++];
							filtered = filtered.filter((t: any) => t.date && t.date >= start);
						}
						if (lowerSql.includes('t.date <= ?') && idx < bindings.length) {
							const end = bindings[idx++];
							filtered = filtered.filter((t: any) => t.date && t.date <= end);
						}
						if (lowerSql.includes('t.account_id = ?') && idx < bindings.length) {
							const acc = bindings[idx++];
							filtered = filtered.filter((t: any) => String(t.account_id) === String(acc));
						}
						if (lowerSql.includes('t.category_id = ?') && idx < bindings.length) {
							const cat = bindings[idx++];
							filtered = filtered.filter((t: any) => Number(t.category_id) === Number(cat));
						}
						if (lowerSql.includes('t.type = ?') && idx < bindings.length) {
							const typ = bindings[idx++];
							filtered = filtered.filter((t: any) => t.type === typ);
						}

						const inc = filtered.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
						const exp = filtered.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
						return {
							total_income: inc,
							total_expense: exp,
							count: filtered.length,
						};
					}
					if (bindings.length > 0) {
						if (lowerSql.includes('where workspace_id =') && lowerSql.includes('user_id =')) {
							const found = rows[key].find((r: any) => {
								if (r.user_id !== undefined) {
									return String(r.user_id) === String(bindings[1]) && (r.workspace_id === undefined || String(r.workspace_id) === String(bindings[0]));
								}
								return true;
							});
							return found ?? null;
						}
						if (lowerSql.includes('where id = ? and workspace_id = ?')) {
							const idToFind = bindings[0];
							const wsToFind = bindings[1];
							const found = rows[key].find((r: any) =>
								(r.id === undefined || String(r.id) === String(idToFind)) &&
								(r.workspace_id === undefined || String(r.workspace_id) === String(wsToFind))
							);
							return found ?? null;
						}
						if (lowerSql.includes('where credit_card_id = ? and reference_month = ?') || lowerSql.includes('where i.credit_card_id = ? and i.reference_month = ?')) {
							const cardIdToFind = bindings[0];
							const refMonthToFind = bindings[1];
							const found = rows[key].find((r: any) =>
								(r.credit_card_id === undefined || String(r.credit_card_id) === String(cardIdToFind)) &&
								(r.reference_month === undefined || String(r.reference_month) === String(refMonthToFind))
							);
							if (found && rows['bank_accounts'] && found.payment_account_id) {
								const acc = rows['bank_accounts'].find((a: any) => a.id === found.payment_account_id);
								return {
									...found,
									payment_account_name: found.payment_account_name ?? acc?.name,
									payment_account_color: found.payment_account_color ?? acc?.color,
								};
							}
							return found ?? null;
						}
						if (lowerSql.includes('where id =') || lowerSql.includes('where i.id =') || lowerSql.includes('where u.id =') || lowerSql.includes('where card.id =') || lowerSql.includes('where cc.id =') || lowerSql.includes('from account_transfers where id =')) {
							const idToFind = bindings[0];
							const found = rows[key].find((r: any) => r.id === undefined || String(r.id) === String(idToFind));
							if (found && key === 'invoices' && rows['bank_accounts'] && found.payment_account_id) {
								const acc = rows['bank_accounts'].find((a: any) => a.id === found.payment_account_id);
								return {
									...found,
									payment_account_name: found.payment_account_name ?? acc?.name,
									payment_account_color: found.payment_account_color ?? acc?.color,
								};
							}
							return found ?? null;
						}
						if (lowerSql.includes('where email =')) {
							const emailToFind = bindings[0];
							const found = rows[key].find((r: any) => r.email === undefined || String(r.email) === String(emailToFind));
							return found ?? null;
						}
						if (lowerSql.includes('where upper(code) =') || lowerSql.includes('where code =')) {
							const codeToFind = String(bindings[0]).toUpperCase();
							const found = rows[key].find((r: any) => r.code === undefined || String(r.code).toUpperCase() === codeToFind);
							return found ?? null;
						}
					}
					return rows[key][0] ?? null;
				}
				return defaultRow;
			}),
			run: vi.fn(async () => {
				const key = getTargetKey(sql);
				const lowerSql = sql.toLowerCase().trim();
				if (key && rows[key] && lowerSql.startsWith('delete')) {
					let targetId = bindings[0];
					if (key === 'notifications' && bindings.length > 1) {
						let wsId = bindings[1];
						rows[key] = rows[key].filter((r: any) => !(String(r.id) === String(targetId) && (!r.workspace_id || String(r.workspace_id) === String(wsId))));
					} else {
						rows[key] = rows[key].filter((r: any) => String(r.id) !== String(targetId));
					}
				}
				if (key && rows[key] && lowerSql.startsWith('insert')) {
					if (key === 'notifications') {
						const [id, workspace_id, user_id, type, title, message, related_entity_type, related_entity_id, is_read, created_at] = bindings;
						rows[key].push({
							id,
							workspace_id,
							user_id,
							type,
							title,
							message,
							related_entity_type: related_entity_type || null,
							related_entity_id: related_entity_id || null,
							is_read: Number(is_read || 0),
							created_at: created_at || new Date().toISOString(),
						});
					}
					if (key === 'financial_goals') {
						const [id, workspace_id, name, target_amount, current_amount, deadline, account_id, color, icon, status] = bindings;
						rows[key].push({
							id,
							workspace_id,
							name,
							target_amount: Number(target_amount),
							current_amount: Number(current_amount || 0),
							deadline: deadline || null,
							target_date: deadline || null,
							account_id: account_id || null,
							color: color || '#10b981',
							icon: icon || 'Target',
							status: status || 'active',
							created_at: new Date().toISOString(),
							updated_at: new Date().toISOString(),
						});
					}
					if (key === 'budgets') {
						const [id, workspace_id, category_id, limit_amount, monthly_limit, month, month_reference, alert_threshold_percent] = bindings;
						const limitVal = Number(limit_amount !== undefined ? limit_amount : monthly_limit);
						const monthVal = month || month_reference || null;
						rows[key].push({
							id,
							workspace_id,
							category_id: Number(category_id),
							limit_amount: limitVal,
							monthly_limit: limitVal,
							month: monthVal,
							month_reference: monthVal,
							alert_threshold_percent: Number(alert_threshold_percent) || 80,
							created_at: new Date().toISOString(),
							updated_at: new Date().toISOString(),
						});
					}
					if (key === 'account_transfers') {
						const [id, workspace_id, from_account_id, to_account_id, amount, description, date] = bindings;
						rows[key].push({
							id,
							workspace_id,
							from_account_id,
							to_account_id,
							amount: Number(amount),
							description,
							date,
							created_at: new Date().toISOString(),
							updated_at: new Date().toISOString(),
						});
					}
					if (key === 'invoices') {
						const [id, credit_card_id, workspace_id, reference_month, closing_date, due_date, total_amount, status, paid_at, payment_account_id] = bindings;
						rows[key].push({
							id,
							credit_card_id,
							workspace_id,
							reference_month,
							closing_date,
							due_date,
							total_amount: Number(total_amount),
							status,
							paid_at,
							payment_account_id,
						});
					}
					if (key === 'transactions') {
						let workspace_id, user_id, category_id, account_id, type, description, amount, date, extId;
						let reconciled = 0;
						if (lowerSql.includes('reconciled')) {
							[workspace_id, user_id, category_id, account_id, type, description, amount, date, extId] = bindings;
							reconciled = 1;
						} else {
							[workspace_id, user_id, category_id, account_id, type, description, amount, date] = bindings;
						}
						const newId = rows[key].length + 1;
						rows[key].push({
							id: newId,
							workspace_id,
							user_id,
							category_id,
							account_id,
							type,
							description,
							amount: Number(amount),
							date,
							reconciled,
							external_id: extId || null,
							created_at: new Date().toISOString(),
						});
					}
				}
				if (key && rows[key] && lowerSql.startsWith('update')) {
					if (key === 'notifications') {
						if (lowerSql.includes('where workspace_id = ? and user_id = ?')) {
							const wsId = bindings[0];
							const uId = bindings[1];
							rows[key].forEach((r: any) => {
								if ((!r.workspace_id || String(r.workspace_id) === String(wsId)) &&
									(!r.user_id || String(r.user_id) === String(uId))) {
									if (!lowerSql.includes('is_read = 0') || Number(r.is_read || 0) === 0) {
										r.is_read = 1;
									}
								}
							});
						} else if (lowerSql.includes('where id = ? and workspace_id = ?')) {
							const idToFind = bindings[0];
							const wsId = bindings[1];
							const item = rows[key].find((r: any) =>
								String(r.id) === String(idToFind) &&
								(!r.workspace_id || String(r.workspace_id) === String(wsId))
							);
							if (item) item.is_read = 1;
						}
					}
					if (key === 'financial_goals' || key === 'savings_goals') {
						let targetId = bindings[bindings.length - 2];
						if (!targetId || String(targetId).length < 3) targetId = bindings[bindings.length - 1];
						const item = (rows[key] || []).find((r: any) => String(r.id) === String(targetId));
						if (item) {
							if (lowerSql.includes("status = 'completed'")) {
								item.status = 'completed';
							} else if (lowerSql.includes('set current_amount = ?')) {
								item.current_amount = Number(bindings[0]);
								item.status = bindings[1];
							}
						}
					}
					if (key === 'budgets') {
						let targetId = bindings[bindings.length - 2];
						if (!targetId || String(targetId).length < 3) targetId = bindings[bindings.length - 1];
						const item = (rows['budgets'] || []).find((b: any) => String(b.id) === String(targetId));
						if (item) {
							if (lowerSql.includes('set limit_amount = ?') || lowerSql.includes('set monthly_limit = ?')) {
								item.limit_amount = Number(bindings[0]);
								item.monthly_limit = Number(bindings[0]);
								item.alert_threshold_percent = Number(bindings[2]) || 80;
								if (bindings[3]) item.month = bindings[3];
								if (bindings[4]) item.month_reference = bindings[4];
							}
						}
					}
					let targetId = bindings[bindings.length - 1];
					if (lowerSql.includes('where id = ? and workspace_id = ? and account_id = ?')) {
						targetId = bindings[1];
					} else if (lowerSql.includes('where id = ? and workspace_id = ?')) {
						targetId = bindings[bindings.length - 2];
					}
					let targetIndex = rows[key].findIndex((r: any) => String(r.id) === String(targetId));
					if (targetIndex < 0 && rows[key].length === 1) {
						targetIndex = 0;
					}
					if (targetIndex >= 0) {
						const item = { ...rows[key][targetIndex] };
						if (lowerSql.includes('reconciled = 1')) {
							item.reconciled = 1;
							if (bindings[0]) item.external_id = bindings[0];
							rows[key][targetIndex] = item;
						} else {
							const setClause = lowerSql.split('set')[1]?.split('where')[0] || '';
							const fieldAssignments = setClause.split(',').map((f) => f.trim().split('=')[0].trim());
							const numAssigned = fieldAssignments.length;
							fieldAssignments.forEach((field, idx) => {
								if (field && idx < numAssigned && idx < bindings.length) {
									item[field] = bindings[idx];
								}
							});
							rows[key][targetIndex] = item;
						}
					}
				}
				return {
					success: true,
					meta: { last_row_id: 1, changes: 1 },
				};
			}),
			all: vi.fn(async () => {
				const key = getTargetKey(sql);
				if (key && rows[key]) {
					const lowerSql = sql.toLowerCase();
					if (key === 'bank_accounts') {
						let list = [...rows[key]];
						if (lowerSql.includes("status = 'active'")) {
							list = list.filter((a: any) => a.status === 'active' || a.status === undefined);
						}
						if (lowerSql.includes('left join transactions') && rows['transactions']) {
							list = list.map((a: any) => {
								const inc = rows['transactions']
									.filter((t: any) => (t.account_id === a.id || t.accountId === a.id) && t.type === 'income')
									.reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);
								const exp = rows['transactions']
									.filter((t: any) => (t.account_id === a.id || t.accountId === a.id) && t.type === 'expense')
									.reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);
								return {
									...a,
									total_income: a.total_income ?? inc,
									total_expense: a.total_expense ?? exp,
								};
							});
						}
						if (rows['account_transfers']) {
							list = list.map((a: any) => {
								const out = rows['account_transfers']
									.filter((t: any) => t.from_account_id === a.id)
									.reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);
								const incoming = rows['account_transfers']
									.filter((t: any) => t.to_account_id === a.id)
									.reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);
								return {
									...a,
									total_transfers_out: a.total_transfers_out ?? out,
									total_transfers_in: a.total_transfers_in ?? incoming,
								};
							});
						}
						if (rows['invoices']) {
							list = list.map((a: any) => {
								const invoicesPaid = rows['invoices']
									.filter((inv: any) => inv.payment_account_id === a.id && inv.status === 'paid')
									.reduce((acc: number, inv: any) => acc + Number(inv.total_amount || inv.amount || 0), 0);
								return {
									...a,
									total_invoices_paid: a.total_invoices_paid ?? invoicesPaid,
								};
							});
						}
						return { results: list, success: true };
					}
					if (key === 'account_transfers') {
						let list = [...rows[key]];
						if (rows['bank_accounts']) {
							list = list.map((t: any) => {
								const fromAcc = rows['bank_accounts'].find((a: any) => a.id === t.from_account_id);
								const toAcc = rows['bank_accounts'].find((a: any) => a.id === t.to_account_id);
								return {
									...t,
									from_account_name: t.from_account_name ?? fromAcc?.name,
									from_account_bank_name: t.from_account_bank_name ?? fromAcc?.bank_name,
									from_account_color: t.from_account_color ?? fromAcc?.color,
									to_account_name: t.to_account_name ?? toAcc?.name,
									to_account_bank_name: t.to_account_bank_name ?? toAcc?.bank_name,
									to_account_color: t.to_account_color ?? toAcc?.color,
								};
							});
						}
						return { results: list, success: true };
					}
					if (key === 'invoices') {
						let list = [...rows[key]];
						if (rows['bank_accounts']) {
							list = list.map((inv: any) => {
								const acc = rows['bank_accounts'].find((a: any) => a.id === inv.payment_account_id);
								return {
									...inv,
									payment_account_name: inv.payment_account_name ?? acc?.name,
									payment_account_color: inv.payment_account_color ?? acc?.color,
								};
							});
						}
						return { results: list, success: true };
					}
					if (key === 'transactions') {
						let list = [...rows[key]];
						if (lowerSql.includes('where workspace_id = ? and account_id = ?')) {
							const wsId = bindings[0];
							const accId = bindings[1];
							list = list.filter((t: any) =>
								(t.workspace_id === undefined || String(t.workspace_id) === String(wsId)) &&
								(t.account_id === undefined || String(t.account_id) === String(accId))
							);
							return { results: list, success: true };
						}

						// Handle reports filtering
						let filtered = [...list];
						if (lowerSql.includes('t.workspace_id = ?') && bindings.length > 0) {
							const ws = bindings[0];
							filtered = filtered.filter((t: any) => t.workspace_id === undefined || String(t.workspace_id) === String(ws));
						}
						let pIdx = 1;
						if (lowerSql.includes('t.date >= ?') && pIdx < bindings.length) {
							const start = bindings[pIdx++];
							filtered = filtered.filter((t: any) => t.date && t.date >= start);
						}
						if (lowerSql.includes('t.date <= ?') && pIdx < bindings.length) {
							const end = bindings[pIdx++];
							filtered = filtered.filter((t: any) => t.date && t.date <= end);
						}
						if (lowerSql.includes('t.account_id = ?') && pIdx < bindings.length) {
							const acc = bindings[pIdx++];
							filtered = filtered.filter((t: any) => String(t.account_id) === String(acc));
						}
						if (lowerSql.includes('t.category_id = ?') && pIdx < bindings.length) {
							const cat = bindings[pIdx++];
							filtered = filtered.filter((t: any) => Number(t.category_id) === Number(cat));
						}
						if (lowerSql.includes('t.type = ?') && pIdx < bindings.length) {
							const typ = bindings[pIdx++];
							filtered = filtered.filter((t: any) => t.type === typ);
						}

						if (lowerSql.includes('group by category_id') || lowerSql.includes('group by t.category_id')) {
							if (lowerSql.includes("type = 'expense'") && lowerSql.includes('date like ?')) {
								const wsId = bindings[0];
								const prefix = String(bindings[1] || '').replace('%', '');
								const filteredTxs = (rows['transactions'] || []).filter((t: any) =>
									(!t.workspace_id || String(t.workspace_id) === String(wsId)) &&
									t.type === 'expense' &&
									t.category_id !== undefined && t.category_id !== null &&
									(!prefix || !t.date || String(t.date).startsWith(prefix))
								);
								const spentMap = new Map<number, number>();
								for (const tx of filteredTxs) {
									const cId = Number(tx.category_id);
									spentMap.set(cId, (spentMap.get(cId) || 0) + Number(tx.amount || tx.total_spent || 0));
								}
								const res = Array.from(spentMap.entries()).map(([category_id, total_spent]) => ({
									category_id,
									total_spent,
								}));
								return { results: res, success: true };
							}
							const groupMap = new Map<string, any>();
							for (const t of filtered) {
								const cat = rows['categories']?.find((c: any) => c.id === t.category_id);
								const k = `${t.category_id}_${t.type}`;
								if (!groupMap.has(k)) {
									groupMap.set(k, {
										category_id: t.category_id,
										name: cat?.name ?? 'Sem Categoria',
										color: cat?.color ?? '#64748b',
										icon: cat?.icon ?? 'Tag',
										type: t.type,
										total: 0,
									});
								}
								groupMap.get(k).total += Number(t.amount || 0);
							}
							const res = Array.from(groupMap.values()).sort((a, b) => b.total - a.total);
							return { results: res, success: true };
						}

						if (lowerSql.includes('group by t.account_id')) {
							const groupMap = new Map<string, any>();
							for (const t of filtered) {
								const acc = rows['bank_accounts']?.find((b: any) => b.id === t.account_id);
								const k = String(t.account_id);
								if (!groupMap.has(k)) {
									groupMap.set(k, {
										account_id: t.account_id,
										name: acc?.name ?? 'Sem Conta',
										bank_name: acc?.bank_name ?? 'Outro',
										color: acc?.color ?? '#0284c7',
										total_income: 0,
										total_expense: 0,
									});
								}
								if (t.type === 'income') {
									groupMap.get(k).total_income += Number(t.amount || 0);
								} else {
									groupMap.get(k).total_expense += Number(t.amount || 0);
								}
							}
							const res = Array.from(groupMap.values());
							return { results: res, success: true };
						}

						// Detailed transactions query
						const detailed = filtered.map((t: any) => {
							const cat = rows['categories']?.find((c: any) => c.id === t.category_id);
							const acc = rows['bank_accounts']?.find((b: any) => b.id === t.account_id);
							return {
								...t,
								category_name: t.category_name ?? cat?.name ?? 'Sem Categoria',
								category_color: t.category_color ?? cat?.color ?? '#64748b',
								category_icon: t.category_icon ?? cat?.icon ?? 'Tag',
								account_name: t.account_name ?? acc?.name ?? 'Sem Conta',
								account_bank_name: t.account_bank_name ?? acc?.bank_name ?? 'Outro',
								account_color: t.account_color ?? acc?.color ?? '#0284c7',
							};
						});
						return { results: detailed, success: true };
					}
					if (key === 'notifications') {
						let list = [...(rows['notifications'] || [])];
						if (bindings.length > 0) {
							const wsId = bindings[0];
							list = list.filter((n: any) => n.workspace_id === undefined || String(n.workspace_id) === String(wsId));
						}
						if (bindings.length > 1) {
							const uId = bindings[1];
							list = list.filter((n: any) => n.user_id === undefined || String(n.user_id) === String(uId));
						}
						if (lowerSql.includes('is_read = 0')) {
							list = list.filter((n: any) => Number(n.is_read || 0) === 0);
						}
						list.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
						return { results: list, success: true };
					}
					if (key === 'financial_goals' || key === 'savings_goals') {
						const targetKey = rows['financial_goals'] && rows['financial_goals'].length > 0 ? 'financial_goals' : (rows['savings_goals'] ? 'savings_goals' : key);
						let list = [...(rows[targetKey] || [])];
						if (bindings.length > 0) {
							const wsId = bindings[0];
							list = list.filter((g: any) => g.workspace_id === undefined || String(g.workspace_id) === String(wsId));
						}
						if (rows['bank_accounts']) {
							list = list.map((g: any) => {
								const acc = rows['bank_accounts'].find((a: any) => a.id === g.account_id);
								return {
									...g,
									account_name: g.account_name ?? acc?.name,
									account_color: g.account_color ?? acc?.color,
									account_bank_name: g.account_bank_name ?? acc?.bank_name,
								};
							});
						}
						return { results: list, success: true };
					}
					if (key === 'budgets') {
						let list = [...(rows['budgets'] || [])];
						if (bindings.length > 0) {
							const wsId = bindings[0];
							list = list.filter((b: any) => b.workspace_id === undefined || String(b.workspace_id) === String(wsId));
						}
						if (bindings.length > 1 && bindings[1]) {
							const m = bindings[1];
							list = list.filter((b: any) => {
								const bMonth = b.month || b.month_reference;
								return !bMonth || bMonth === m;
							});
						}
						if (rows['categories']) {
							list = list.map((b: any) => {
								const cat = rows['categories'].find((c: any) => c.id === b.category_id);
								return {
									...b,
									category_name: b.category_name ?? cat?.name ?? 'Categoria',
									category_icon: b.category_icon ?? cat?.icon ?? 'Circle',
									category_color: b.category_color ?? cat?.color ?? '#999999',
									category_type: b.category_type ?? cat?.type ?? 'expense',
								};
							});
						}
						return { results: list, success: true };
					}
					return { results: rows[key] ?? [], success: true };
				}
				return { results: [], success: true };
			}),
		};
		return stmt;
	};

	const db: D1Database = {
		prepare: vi.fn((sql: string) => buildStmt(sql) as any),
		dump: vi.fn(async () => new ArrayBuffer(0)),
		batch: vi.fn(async () => []),
		exec: vi.fn(async () => ({ count: 0, duration: 0 })),
	} as any;

	return db;
}

/**
 * Cria um mock de R2Bucket para testes de upload/download.
 */
export function createR2Mock() {
	const store: Record<string, { body: ArrayBuffer; meta: any }> = {};

	const r2: R2Bucket = {
		put: vi.fn(async (key: string, body: any, options?: any) => {
			store[key] = { body, meta: options };
			return {} as any;
		}),
		get: vi.fn(async (key: string) => {
			const item = store[key];
			if (!item) return null;
			return {
				arrayBuffer: async () => item.body,
				httpMetadata: item.meta?.httpMetadata || {},
				customMetadata: item.meta?.customMetadata || {},
				size: item.body.byteLength,
			} as any;
		}),
		delete: vi.fn(async (key: string) => {
			delete store[key];
		}),
		list: vi.fn(async () => ({ objects: [], truncated: false } as any)),
		head: vi.fn(async (key: string) => {
			const item = store[key];
			if (!item) return null;
			return {
				size: item.body.byteLength,
				httpMetadata: item.meta?.httpMetadata || {},
				customMetadata: item.meta?.customMetadata || {},
			} as any;
		}),
	};

	return r2;
}

/**
 * Cria o objeto de Bindings do Cloudflare Workers simulado para injeção no Hono.
 */
export function createEnvMock(d1Rows: Record<string, any[]> = {}, extraBindings: Record<string, any> = {}) {
	const db = createD1Mock(d1Rows);
	const r2 = createR2Mock();

	return {
		financeiro_db: db,
		financeiro_comprovantes: r2,
		JWT_SECRET: 'test-secret-key-for-unit-tests-1234567890',
		...extraBindings,
	};
}
