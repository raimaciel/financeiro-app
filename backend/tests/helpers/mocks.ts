import { vi } from 'vitest';

/**
 * Cria um mock completo de D1Database para uso nos testes.
 * Simula prepare().bind().first() / run() / all() com dados configuráveis.
 */
export function createD1Mock(rows: Record<string, any[]> = {}) {
	const defaultRow = rows['default']?.[0] ?? null;
	// Ordena chaves pela mais longa primeiro para evitar que "transactions" intercepte "recurring_transactions"
	const sortedKeys = Object.keys(rows).sort((a, b) => b.length - a.length);

	const getTargetKey = (sql: string) => {
		const lowerSql = sql.toLowerCase();
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
					if (bindings.length > 0) {
						const lowerSql = sql.toLowerCase();
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
				const lowerSql = sql.toLowerCase();
				if (key && rows[key] && lowerSql.startsWith('delete')) {
					let targetId = bindings[0];
					rows[key] = rows[key].filter((r: any) => String(r.id) !== String(targetId));
				}
				if (key && rows[key] && lowerSql.startsWith('insert')) {
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
						const [workspace_id, user_id, category_id, account_id, type, description, amount, date] = bindings;
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
							created_at: new Date().toISOString(),
						});
					}
				}
				if (key && rows[key] && lowerSql.startsWith('update')) {
					let targetId = bindings[bindings.length - 1];
					if (lowerSql.includes('where id = ? and workspace_id = ?')) {
						targetId = bindings[bindings.length - 2];
					}
					let targetIndex = rows[key].findIndex((r: any) => String(r.id) === String(targetId));
					if (targetIndex < 0 && rows[key].length === 1) {
						targetIndex = 0;
					}
					if (targetIndex >= 0) {
						const item = { ...rows[key][targetIndex] };
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
