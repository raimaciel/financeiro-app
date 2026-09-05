import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import { parseOFX, type RawImportTransaction } from '../utils/ofxParser';
import { parseCSV, detectDelimiter, parseCSVLine, parseCsvDate, parseCsvAmount } from '../utils/csvParser';
import { suggestCategory, normalizeText } from '../utils/categoryRules';
import { checkDuplicate, type ExistingTransactionRef } from '../utils/deduplication';

const importsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas com autenticação JWT
importsRouter.use('*', authMiddleware);

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

	// Se não achou pelos nomes das colunas, assume ordem clássica: 0=data, 1=valor, 2=descrição
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

// =========================================================================
// 1. POST /workspaces/:workspaceId/accounts/:accountId/import - PREVIEW
// =========================================================================
importsRouter.post('/workspaces/:workspaceId/accounts/:accountId/import', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const accountId = c.req.param('accountId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// 1. Validação de membro do workspace
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

		// 3. Obtenção do conteúdo do arquivo
		let fileContent = '';
		let fileName = 'extrato';
		const contentType = c.req.header('content-type') || '';

		if (contentType.includes('multipart/form-data')) {
			const formData = await c.req.formData();
			const file = formData.get('file') as File | null;
			if (!file || typeof file === 'string') {
				return c.json({ error: 'Nenhum arquivo enviado. Selecione um arquivo OFX ou CSV.' }, 400);
			}
			fileName = file.name || 'extrato';
			const arrayBuffer = await file.arrayBuffer();
			try {
				const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
				fileContent = utf8Decoder.decode(arrayBuffer);
			} catch {
				const latin1Decoder = new TextDecoder('iso-8859-1');
				fileContent = latin1Decoder.decode(arrayBuffer);
			}
		} else if (contentType.includes('application/json')) {
			const body = await c.req.json().catch(() => ({}));
			fileContent = body.fileContent || body.content || body.text || '';
			fileName = body.filename || body.fileName || 'extrato';
		} else {
			fileContent = await c.req.text();
		}

		if (!fileContent || !fileContent.trim()) {
			return c.json({ error: 'O arquivo de extrato enviado está vazio' }, 400);
		}

		// 4. Detecção automática do formato (OFX vs CSV)
		const lowerName = fileName.toLowerCase();
		const isOfx =
			lowerName.endsWith('.ofx') ||
			fileContent.includes('<OFX>') ||
			fileContent.includes('OFXHEADER') ||
			fileContent.includes('<STMTTRN>');

		let rawTransactions: RawImportTransaction[] = [];

		if (isOfx) {
			rawTransactions = parseOFX(fileContent);
		} else {
			rawTransactions = parseCSV(fileContent, 'generic');
			if (rawTransactions.length === 0) {
				rawTransactions = parseSimpleCSV(fileContent);
			}
		}

		if (rawTransactions.length === 0) {
			return c.json(
				{
					error: isOfx
						? 'Nenhuma transação válida encontrada no arquivo OFX. Verifique a estrutura do extrato.'
						: 'Nenhuma transação encontrada no arquivo CSV. Verifique se possui colunas com data, valor e descrição.',
				},
				400
			);
		}

		// 5. Busca categorias do workspace para sugestão automática
		const catRes = await db
			.prepare('SELECT id, name, type FROM categories WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<any>();

		const existingCategories = catRes.results || [];

		// 6. Busca transações existentes na conta para identificação de possíveis duplicatas
		const txRes = await db
			.prepare('SELECT id, date, amount, description, type FROM transactions WHERE workspace_id = ? AND account_id = ?')
			.bind(workspaceId, accountId)
			.all<ExistingTransactionRef>();

		const existingTransactions = txRes.results || [];

		let duplicatesCount = 0;

		// 7. Normalização das transações para o retorno de preview
		const processedTransactions = rawTransactions.map((raw) => {
			const categorySuggestion = suggestCategory(raw.description, existingCategories);

			// Verifica duplicata
			const dupResult = checkDuplicate(
				{
					date: raw.date,
					amount: raw.amount,
					description: raw.description,
					type: raw.type,
				},
				existingTransactions
			);

			const isExactMatch = existingTransactions.some((existing) =>
				existing.date === raw.date &&
				Math.abs(Number(existing.amount) - raw.amount) < 0.001 &&
				normalizeText(existing.description || '') === normalizeText(raw.description || '')
			);

			const isDuplicate = dupResult.isPossibleDuplicate || isExactMatch;
			if (isDuplicate) {
				duplicatesCount++;
			}

			return {
				id: raw.id || crypto.randomUUID(),
				date: raw.date,
				description: raw.description,
				amount: raw.amount,
				type: raw.type, // 'income' se valor positivo, 'expense' se negativo
				category_id: categorySuggestion.categoryId || null,
				category_name: categorySuggestion.categoryName || null,
				is_duplicate: isDuplicate,
				duplicate_reason: dupResult.duplicateReason || (isExactMatch ? 'Transação idêntica já cadastrada nesta conta' : null),
			};
		});

		return c.json({
			account_id: accountId,
			account_name: account.name,
			bank_name: account.bank_name,
			filename: fileName,
			fileType: isOfx ? 'ofx' : 'csv',
			totalCount: processedTransactions.length,
			duplicatesCount,
			newCount: processedTransactions.length - duplicatesCount,
			transactions: processedTransactions,
		});
	} catch (err: any) {
		console.error('Erro no preview de importação de extrato:', err);
		return c.json({ error: `Erro ao processar extrato: ${err?.message || 'Erro desconhecido'}` }, 500);
	}
});

// =========================================================================
// 2. POST /workspaces/:workspaceId/accounts/:accountId/import/confirm - CONFIRMAR
// =========================================================================
importsRouter.post('/workspaces/:workspaceId/accounts/:accountId/import/confirm', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const accountId = c.req.param('accountId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		// 1. Validação de membro do workspace
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		// 2. Validação da conta bancária
		const account = await db
			.prepare('SELECT id, name, workspace_id FROM bank_accounts WHERE id = ? AND workspace_id = ?')
			.bind(accountId, workspaceId)
			.first<any>();

		if (!account) {
			return c.json({ error: 'Conta bancária não encontrada ou não pertence a este workspace' }, 404);
		}

		// 3. Recebe array de transações revisadas
		const body = await c.req.json().catch(() => ({}));
		const items = Array.isArray(body.transactions) ? body.transactions : [];

		if (items.length === 0) {
			return c.json({ error: 'Nenhuma transação enviada para confirmação' }, 400);
		}

		// 4. Busca transações existentes na conta para deduplicação simples (data + valor + descrição + account_id)
		const existingRes = await db
			.prepare('SELECT date, amount, description FROM transactions WHERE workspace_id = ? AND account_id = ?')
			.bind(workspaceId, accountId)
			.all<any>();

		const existingList = existingRes.results || [];
		const seenKeys = new Set<string>();

		for (const ex of existingList) {
			const cleanDesc = normalizeText(ex.description || '');
			const key = `${ex.date}_${Number(ex.amount).toFixed(2)}_${cleanDesc}`;
			seenKeys.add(key);
		}

		let importedCount = 0;
		let duplicatesIgnored = 0;

		// 5. Insere as transações não duplicadas
		for (const item of items) {
			const isoDate = String(item.date || '').trim();
			if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
				continue;
			}

			const amountNum = Math.abs(Number(item.amount));
			if (isNaN(amountNum) || amountNum <= 0) {
				continue;
			}

			const descriptionStr = String(item.description || 'Lançamento Importado').trim();
			const cleanDesc = normalizeText(descriptionStr);
			const dedupKey = `${isoDate}_${amountNum.toFixed(2)}_${cleanDesc}`;

			// Se já existe no banco ou se foi repetida dentro do mesmo arquivo
			if (seenKeys.has(dedupKey)) {
				duplicatesIgnored++;
				continue;
			}

			seenKeys.add(dedupKey);

			const txType: 'income' | 'expense' = item.type === 'income' ? 'income' : 'expense';
			const categoryIdNum = item.category_id ? Number(item.category_id) : (item.categoryId ? Number(item.categoryId) : null);

			await db
				.prepare(`
					INSERT INTO transactions 
					(workspace_id, user_id, category_id, account_id, type, description, amount, date)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				`)
				.bind(
					workspaceId,
					userId,
					categoryIdNum,
					accountId,
					txType,
					descriptionStr,
					amountNum,
					isoDate
				)
				.run();

			importedCount++;
		}

		return c.json({
			success: true,
			imported_count: importedCount,
			duplicates_ignored: duplicatesIgnored,
			message: `${importedCount} transação(ões) importada(s) com sucesso. ${duplicatesIgnored > 0 ? `${duplicatesIgnored} duplicada(s) ignorada(s).` : ''}`.trim(),
		});
	} catch (err: any) {
		console.error('Erro ao confirmar importação de extrato:', err);
		return c.json({ error: `Falha ao gravar transações: ${err?.message || 'Erro desconhecido'}` }, 500);
	}
});

export default importsRouter;
