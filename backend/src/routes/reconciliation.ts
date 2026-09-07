import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import { parseOFX, type RawImportTransaction } from '../utils/ofxParser';
import { parseCSV, detectDelimiter, parseCSVLine, parseCsvDate, parseCsvAmount } from '../utils/csvParser';
import { suggestCategory, normalizeText } from '../utils/categoryRules';

const reconciliationRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas com autenticação JWT
reconciliationRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

/**
 * Parser de fallback simples para CSVs com formato flexível (ex: data,valor,descricao).
 */
function parseSimpleCSV(csvText: string): RawImportTransaction[] {
	const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
	if (lines.length < 2) return [];

	const delimiter = detectDelimiter(csvText);
	const headers = parseCSVLine(lines[0], delimiter).map((h) =>
		normalizeText(h).toLowerCase().replace(/[^a-z0-9]/g, '')
	);

	let dateIdx = headers.findIndex((h) => h.includes('data') || h.includes('date'));
	let amountIdx = headers.findIndex((h) => h.includes('valor') || h.includes('amount') || h.includes('vlr'));
	let descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('memo') || h.includes('historico') || h.includes('titulo'));

	if (dateIdx === -1 && amountIdx === -1 && descIdx === -1) {
		dateIdx = 0;
		amountIdx = 1;
		descIdx = 2;
	}

	const transactions: RawImportTransaction[] = [];

	for (let i = 1; i < lines.length; i++) {
		const cols = parseCSVLine(lines[i], delimiter);
		if (cols.length <= 1) continue;

		const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || '';
		const rawVal = cols[amountIdx >= 0 ? amountIdx : 1] || '';
		const rawDesc = cols[descIdx >= 0 ? descIdx : 2] || 'Lançamento Importado';

		const parsedDate = parseCsvDate(rawDate);
		const parsedAmt = parseCsvAmount(rawVal);

		if (!parsedDate || !parsedAmt) continue;

		const isExpense = parsedAmt.rawAmount < 0;
		const amount = Math.abs(parsedAmt.amount);
		const type: 'income' | 'expense' = isExpense ? 'expense' : 'income';

		transactions.push({
			id: crypto.randomUUID(),
			date: parsedDate,
			description: rawDesc.replace(/^["']|["']$/g, '').trim(),
			rawAmount: parsedAmt.rawAmount,
			amount: Number(amount.toFixed(2)),
			type,
		});
	}

	return transactions;
}

function calculateDaysDifference(dateStr1: string, dateStr2: string): number {
	const d1 = new Date(dateStr1);
	const d2 = new Date(dateStr2);
	const diffMs = Math.abs(d1.getTime() - d2.getTime());
	return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// =========================================================================
// 1. POST /workspaces/:workspaceId/accounts/:accountId/reconciliation/match
// =========================================================================
reconciliationRouter.post('/workspaces/:workspaceId/accounts/:accountId/reconciliation/match', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const accountId = c.req.param('accountId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// 1. Validação de permissão do usuário
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		// 2. Validação da conta bancária
		const account = await db
			.prepare('SELECT id, name, bank_name, workspace_id, status FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(accountId, workspaceId)
			.first<any>();

		if (!account) {
			return c.json({ error: 'Conta bancária não encontrada ou não pertence a este workspace' }, 404);
		}

		// 3. Obtenção das transações do extrato (seja arquivo bruto ou array já parseado)
		let rawTransactions: RawImportTransaction[] = [];
		const contentType = c.req.header('content-type') || '';

		if (contentType.includes('multipart/form-data')) {
			const formData = await c.req.formData();
			const file = formData.get('file') as File | null;
			if (!file || typeof file === 'string') {
				return c.json({ error: 'Nenhum arquivo enviado. Selecione um arquivo OFX ou CSV.' }, 400);
			}
			const fileName = file.name || 'extrato';
			const arrayBuffer = await file.arrayBuffer();
			let fileContent = '';
			try {
				const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
				fileContent = utf8Decoder.decode(arrayBuffer);
			} catch {
				const latin1Decoder = new TextDecoder('iso-8859-1');
				fileContent = latin1Decoder.decode(arrayBuffer);
			}

			const lowerName = fileName.toLowerCase();
			const isOfx =
				lowerName.endsWith('.ofx') ||
				fileContent.includes('<OFX>') ||
				fileContent.includes('OFXHEADER') ||
				fileContent.includes('<STMTTRN>');

			if (isOfx) {
				rawTransactions = parseOFX(fileContent);
			} else {
				rawTransactions = parseCSV(fileContent, 'generic');
				if (rawTransactions.length === 0) {
					rawTransactions = parseSimpleCSV(fileContent);
				}
			}
		} else if (contentType.includes('application/json')) {
			const body = await c.req.json().catch(() => ({}));
			if (Array.isArray(body.items)) {
				rawTransactions = body.items;
			} else if (body.fileContent) {
				const fileContent = String(body.fileContent);
				const fileName = String(body.filename || body.fileName || 'extrato');
				const lowerName = fileName.toLowerCase();
				const isOfx =
					lowerName.endsWith('.ofx') ||
					fileContent.includes('<OFX>') ||
					fileContent.includes('OFXHEADER') ||
					fileContent.includes('<STMTTRN>');

				if (isOfx) {
					rawTransactions = parseOFX(fileContent);
				} else {
					rawTransactions = parseCSV(fileContent, 'generic');
					if (rawTransactions.length === 0) {
						rawTransactions = parseSimpleCSV(fileContent);
					}
				}
			}
		} else {
			const fileContent = await c.req.text();
			if (fileContent.includes('<OFX>') || fileContent.includes('OFXHEADER')) {
				rawTransactions = parseOFX(fileContent);
			} else {
				rawTransactions = parseCSV(fileContent, 'generic');
				if (rawTransactions.length === 0) {
					rawTransactions = parseSimpleCSV(fileContent);
				}
			}
		}

		if (rawTransactions.length === 0) {
			return c.json({ error: 'Nenhuma movimentação identificada no extrato para conciliação' }, 400);
		}

		// 4. Carregar categorias para enriquecimento
		const catRes = await db
			.prepare('SELECT id, name, type FROM categories WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<any>();
		const existingCategories = catRes.results || [];

		// 5. Carregar lançamentos existentes na conta bancária
		const txRes = await db
			.prepare('SELECT id, date, amount, description, type, category_id, reconciled, external_id FROM transactions WHERE workspace_id = ? AND account_id = ?')
			.bind(workspaceId, accountId)
			.all<any>();
		const existingTransactions = txRes.results || [];

		// 6. Algoritmo de Conciliação
		const matchedTxIds = new Set<any>();

		interface ReconciliationResultItem {
			id: string;
			date: string;
			amount: number;
			description: string;
			type: 'income' | 'expense';
			category_id?: number | null;
			category_name?: string | null;
			external_id?: string | null;
			status: 'matched_exact' | 'matched_approximate' | 'unmatched';
			confidence: 'high' | 'medium' | 'none';
			suggested_action: 'ignore' | 'link_existing' | 'create_new';
			matched_transaction?: any;
			difference_days?: number;
		}

		// Passo 6.1: Identificar Matches Exatos (mesma data, mesmo valor, mesmo tipo)
		const results: ReconciliationResultItem[] = rawTransactions.map((item) => {
			const categorySuggestion = suggestCategory(item.description, existingCategories);
			const extId = item.fitid || item.id || null;

			// Procura match exato primeiro
			const exactMatch = existingTransactions.find(
				(tx) =>
					!matchedTxIds.has(tx.id) &&
					tx.type === item.type &&
					Math.abs(Number(tx.amount) - Number(item.amount)) < 0.001 &&
					tx.date === item.date
			);

			if (exactMatch) {
				matchedTxIds.add(exactMatch.id);
				return {
					id: item.id || crypto.randomUUID(),
					date: item.date,
					amount: item.amount,
					description: item.description,
					type: item.type,
					category_id: exactMatch.category_id || (categorySuggestion ? categorySuggestion.id : null),
					category_name: categorySuggestion ? categorySuggestion.name : null,
					external_id: extId,
					status: 'matched_exact',
					confidence: 'high',
					suggested_action: 'ignore',
					matched_transaction: exactMatch,
					difference_days: 0,
				};
			}

			// Procura match aproximado (+/- 3 dias)
			const approxMatch = existingTransactions.find((tx) => {
				if (matchedTxIds.has(tx.id)) return false;
				if (tx.type !== item.type) return false;
				if (Math.abs(Number(tx.amount) - Number(item.amount)) >= 0.001) return false;
				const diff = calculateDaysDifference(tx.date, item.date);
				return diff <= 3;
			});

			if (approxMatch) {
				matchedTxIds.add(approxMatch.id);
				const diff = calculateDaysDifference(approxMatch.date, item.date);
				return {
					id: item.id || crypto.randomUUID(),
					date: item.date,
					amount: item.amount,
					description: item.description,
					type: item.type,
					category_id: approxMatch.category_id || (categorySuggestion ? categorySuggestion.id : null),
					category_name: categorySuggestion ? categorySuggestion.name : null,
					external_id: extId,
					status: 'matched_approximate',
					confidence: 'medium',
					suggested_action: 'link_existing',
					matched_transaction: approxMatch,
					difference_days: diff,
				};
			}

			// Sem match
			return {
				id: item.id || crypto.randomUUID(),
				date: item.date,
				amount: item.amount,
				description: item.description,
				type: item.type,
				category_id: categorySuggestion ? categorySuggestion.id : null,
				category_name: categorySuggestion ? categorySuggestion.name : null,
				external_id: extId,
				status: 'unmatched',
				confidence: 'none',
				suggested_action: 'create_new',
				matched_transaction: null,
			};
		});

		const matched_exact_count = results.filter((r) => r.status === 'matched_exact').length;
		const matched_approximate_count = results.filter((r) => r.status === 'matched_approximate').length;
		const unmatched_count = results.filter((r) => r.status === 'unmatched').length;

		return c.json({
			account: {
				id: account.id,
				name: account.name,
				bank_name: account.bank_name,
			},
			total_items: results.length,
			matched_exact_count,
			matched_approximate_count,
			unmatched_count,
			items: results,
		});
	} catch (err) {
		console.error('Erro na conciliação bancária / match:', err);
		return c.json({ error: 'Erro interno ao processar conciliação bancária' }, 500);
	}
});

// =========================================================================
// 2. POST /workspaces/:workspaceId/accounts/:accountId/reconciliation/confirm
// =========================================================================
reconciliationRouter.post('/workspaces/:workspaceId/accounts/:accountId/reconciliation/confirm', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const accountId = c.req.param('accountId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// 1. Validação de permissão do usuário
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		// 2. Validação da conta bancária
		const account = await db
			.prepare('SELECT id, name, bank_name, workspace_id, status FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(accountId, workspaceId)
			.first<any>();

		if (!account) {
			return c.json({ error: 'Conta bancária não encontrada ou não pertence a este workspace' }, 404);
		}

		// 3. Obtenção das decisões
		const body = await c.req.json().catch(() => ({}));
		const decisions = Array.isArray(body.decisions) ? body.decisions : [];

		if (decisions.length === 0) {
			return c.json({ error: 'Nenhuma decisão de conciliação enviada' }, 400);
		}

		let linked_count = 0;
		let created_count = 0;
		let ignored_count = 0;

		for (const d of decisions) {
			const action = d.action; // 'ignore' | 'link_existing' | 'create_new'
			const item = d.statement_item || {};
			const extId = d.external_id || item.external_id || item.fitid || item.id || null;

			if (action === 'ignore') {
				ignored_count++;
				continue;
			}

			if (action === 'link_existing') {
				const txId = d.transaction_id || (d.matched_transaction && d.matched_transaction.id);
				if (!txId) {
					ignored_count++;
					continue;
				}

				await db
					.prepare('UPDATE transactions SET reconciled = 1, external_id = COALESCE(?, external_id) WHERE id = ? AND workspace_id = ? AND account_id = ?')
					.bind(extId, txId, workspaceId, accountId)
					.run();

				linked_count++;
				continue;
			}

			if (action === 'create_new') {
				const date = item.date;
				const amount = Number(item.amount);
				const description = item.description || 'Lançamento Conciliado';
				const type = item.type || 'expense';
				const categoryId = item.category_id ? Number(item.category_id) : null;

				await db
					.prepare(`
						INSERT INTO transactions (
							workspace_id,
							user_id,
							category_id,
							account_id,
							type,
							description,
							amount,
							date,
							reconciled,
							external_id
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
					`)
					.bind(workspaceId, userId, categoryId, accountId, type, description, amount, date, extId)
					.run();

				created_count++;
			}
		}

		return c.json({
			success: true,
			linked_count,
			created_count,
			ignored_count,
			total_processed: decisions.length,
			message: `Conciliação concluída: ${created_count} criados, ${linked_count} vinculados e ${ignored_count} ignorados.`,
		});
	} catch (err) {
		console.error('Erro ao confirmar conciliação:', err);
		return c.json({ error: 'Erro ao processar confirmação de conciliação' }, 500);
	}
});

export default reconciliationRouter;
