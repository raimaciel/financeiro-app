import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import { parseOFX } from '../utils/ofxParser';
import { parseCSV } from '../utils/csvParser';
import { extractTransactions, detectInvoiceReference } from '../utils/caixaInvoiceParser';
import { suggestCategory } from '../utils/categoryRules';
import { detectInstallment } from '../utils/installmentDetector';
import { checkDuplicate, type ExistingTransactionRef } from '../utils/deduplication';

const importRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas com autenticação JWT
importRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// Helper para resolver um workspace válido para o usuário caso não venha no path
async function resolveUserWorkspaceId(db: D1Database, userId: string, preferredWorkspaceId?: string | null): Promise<{ workspaceId: string; role: string } | null> {
	if (preferredWorkspaceId) {
		const role = await getWorkspaceMemberRole(db, preferredWorkspaceId, userId);
		if (role) {
			return { workspaceId: preferredWorkspaceId, role };
		}
	}

	const member = await db
		.prepare('SELECT workspace_id, role FROM workspace_members WHERE user_id = ? ORDER BY invited_at ASC LIMIT 1')
		.bind(userId)
		.first<{ workspace_id: string; role: string }>();

	if (member) {
		return { workspaceId: member.workspace_id, role: member.role };
	}

	return null;
}

// =========================================================================
// 1. ENDPOINTS DE PREVIEW (CAIXA PDF / TEXTO) - NÃO SALVA NO BANCO
// =========================================================================

async function handlePreview(c: any) {
	try {
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		let pdfText = '';
		let targetWorkspaceId = c.req.param('workspaceId') || null;

		const contentType = c.req.header('content-type') || '';

		if (contentType.includes('application/json')) {
			const body = await c.req.json();
			pdfText = body.pdfText || body.text || '';
			if (body.workspaceId) targetWorkspaceId = body.workspaceId;
		} else if (contentType.includes('multipart/form-data')) {
			const formData = await c.req.formData();
			pdfText = (formData.get('pdfText') as string) || (formData.get('text') as string) || '';
			const formWs = formData.get('workspaceId') as string | null;
			if (formWs) targetWorkspaceId = formWs;
		} else {
			pdfText = await c.req.text();
		}

		if (!pdfText || !pdfText.trim()) {
			return c.json({ error: 'Nenhum texto de fatura fornecido para análise.' }, 400);
		}

		// Extrai lançamentos sem truncamento e detecta competência da fatura (Bugs 1 & 2)
		const extracted = extractTransactions(pdfText);
		const invoiceRef = detectInvoiceReference(pdfText);

		if (extracted.length === 0) {
			return c.json(
				{
					error: 'Nenhuma transação válida encontrada no texto da fatura. Certifique-se de que o PDF/texto contém linhas no formato: DD/MM DESCRIÇÃO VALOR(D|C).',
				},
				400
			);
		}

		// Se tiver workspace associado, buscar categorias e cartões de crédito
		let existingCategories: Array<{ id: number; name: string; type?: string }> = [];
		let existingCreditCards: Array<{ id: string; name: string; last_four_digits?: string | null; brand?: string | null }> = [];

		if (targetWorkspaceId) {
			const catRes = await db
				.prepare('SELECT id, name, type FROM categories WHERE workspace_id = ?')
				.bind(targetWorkspaceId)
				.all<{ id: number; name: string; type?: string }>();
			existingCategories = catRes.results || [];

			const cardRes = await db
				.prepare('SELECT id, name, last_four_digits, brand FROM credit_cards WHERE workspace_id = ?')
				.bind(targetWorkspaceId)
				.all<{ id: string; name: string; last_four_digits?: string | null; brand?: string | null }>();
			existingCreditCards = cardRes.results || [];
		}

		const currentYear = invoiceRef.ano || new Date().getFullYear();
		const currentMonth = invoiceRef.mes || new Date().getMonth() + 1;

		const transactionsWithSuggestions = extracted.map((tx) => {
			const categorySuggestion = suggestCategory(tx.descricao, existingCategories);

			// Bug 3: Vinculação automática do cartão pelo final de 4 dígitos
			let matchedCardId: string | null = null;
			let matchedCardLabel = tx.cartao;
			let isCardIdentified = false;

			if (tx.cartaoDigitos && existingCreditCards.length > 0) {
				const matchedCard = existingCreditCards.find((c) => {
					if (c.last_four_digits && c.last_four_digits.trim() === tx.cartaoDigitos) {
						return true;
					}
					if (c.name && c.name.includes(tx.cartaoDigitos!)) {
						return true;
					}
					return false;
				});

				if (matchedCard) {
					matchedCardId = matchedCard.id;
					matchedCardLabel = `${matchedCard.name}${matchedCard.last_four_digits ? ` (•••• ${matchedCard.last_four_digits})` : ''}`;
					isCardIdentified = true;
				}
			}

			// Bug 2: Data de competência da fatura
			const [dd] = tx.dataTransacao.split('/');
			const dataCompetencia = tx.dataCompetencia || `${currentYear}-${String(currentMonth).padStart(2, '0')}-${dd.padStart(2, '0')}`;

			return {
				id: tx.id || crypto.randomUUID(),
				dataTransacao: tx.dataTransacao,
				dataParcial: tx.dataParcial,
				dataCompetencia,
				date: dataCompetencia,
				ano: currentYear,
				mes: currentMonth,
				mesReferenciaFatura: invoiceRef.mesReferencia,
				dataVencimento: invoiceRef.dataVencimento,
				descricao: tx.descricao, // Descrição integral (Bug 1)
				description: tx.descricao,
				valor: tx.valor,
				amount: tx.valor,
				tipo: tx.tipo,
				type: tx.tipo === 'C' ? 'income' : 'expense',
				cartao: matchedCardLabel,
				cartaoDigitos: tx.cartaoDigitos,
				creditCardId: matchedCardId,
				cartaoIdentificado: isCardIdentified,
				cardLabel: matchedCardLabel,
				precisaRevisao: true,
				categoryId: categorySuggestion.categoryId,
				categoryName: categorySuggestion.categoryName,
			};
		});

		return c.json({
			success: true,
			totalCount: transactionsWithSuggestions.length,
			precisaRevisao: true,
			mesReferenciaFatura: invoiceRef.mesReferencia,
			anoFatura: currentYear,
			mesFatura: currentMonth,
			dataVencimento: invoiceRef.dataVencimento,
			transactions: transactionsWithSuggestions,
		});
	} catch (err: any) {
		console.error('Erro no preview de importação:', err);
		return c.json({ error: `Falha ao processar preview da fatura: ${err?.message || 'Erro desconhecido'}` }, 500);
	}
}

// Rotas de preview
importRouter.post('/import/preview', handlePreview);
importRouter.post('/api/import/preview', handlePreview);
importRouter.post('/workspaces/:workspaceId/import/preview', handlePreview);

// =========================================================================
// 2. ENDPOINT DE CONFIRMAÇÃO EM LOTE - SALVA DEFINITIVAMENTE NO BANCO
// =========================================================================

async function handleConfirm(c: any) {
	try {
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const body = await c.req.json();
		const rawWorkspaceId = c.req.param('workspaceId') || body.workspaceId;

		const resolved = await resolveUserWorkspaceId(db, userId, rawWorkspaceId);
		if (!resolved) {
			return c.json({ error: 'Workspace não encontrado ou você não tem permissão.' }, 403);
		}

		const { workspaceId, role } = resolved;
		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Visualizadores não podem importar transações.' }, 403);
		}

		const rawTransactions = Array.isArray(body.transactions) ? body.transactions : [];
		if (rawTransactions.length === 0) {
			return c.json({ error: 'Nenhuma transação enviada para confirmação.' }, 400);
		}

		const statements: any[] = [];

		for (const item of rawTransactions) {
			// Bug 2: Prioriza dataCompetencia sobre a data de compra original
			let isoDate: string | null = null;

			if (item.dataCompetencia && /^\d{4}-\d{2}-\d{2}$/.test(String(item.dataCompetencia).trim())) {
				isoDate = String(item.dataCompetencia).trim();
			} else if (item.dataCompleta && /^\d{4}-\d{2}-\d{2}$/.test(String(item.dataCompleta).trim())) {
				isoDate = String(item.dataCompleta).trim();
			} else if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date).trim())) {
				isoDate = String(item.date).trim();
			} else if (item.dataParcial && (item.ano || item.year)) {
				const yearNum = parseInt(String(item.ano || item.year).trim(), 10);
				if (isNaN(yearNum) || yearNum < 1970 || yearNum > 2100) {
					continue;
				}
				const dateParts = String(item.dataParcial).trim().split('/');
				if (dateParts.length !== 2) continue;
				const day = dateParts[0].padStart(2, '0');
				const month = dateParts[1].padStart(2, '0');
				isoDate = `${yearNum}-${month}-${day}`;
			} else if (item.data && /^\d{2}\/\d{2}\/\d{4}$/.test(String(item.data).trim())) {
				const [dd, mm, yyyy] = String(item.data).trim().split('/');
				isoDate = `${yyyy}-${mm}-${dd}`;
			}

			if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
				continue;
			}

			// Validação do valor (positivo)
			const amount = Number(item.valor !== undefined ? item.valor : item.amount);
			if (isNaN(amount) || amount <= 0) {
				continue;
			}

			// Validação da descrição completa sem truncamento (Bug 1)
			const descricao = String(item.descricao || item.description || 'Lançamento Importado').trim();

			// Validação do tipo (D/expense ou C/income)
			const rawType = String(item.tipo || item.type || 'D').toUpperCase();
			const txType: 'income' | 'expense' = (rawType === 'C' || rawType === 'INCOME') ? 'income' : 'expense';

			const categoryIdNum = item.categoryId ? Number(item.categoryId) : null;
			// Bug 3: Vincula ao credit_card_id informado na revisão
			const targetCreditCardId = item.creditCardId || body.creditCardId || null;

			const installments = Math.max(1, Math.floor(Number(item.installments) || 1));
			const installmentCurrent = Math.max(1, Math.floor(Number(item.installmentCurrent) || 1));
			const installmentGroupId = installments > 1 ? crypto.randomUUID() : null;

			const stmt = db
				.prepare(
					`INSERT INTO transactions 
					(workspace_id, user_id, category_id, credit_card_id, type, description, amount, installments, installment_current, date, installment_group_id)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					workspaceId,
					userId,
					categoryIdNum,
					targetCreditCardId,
					txType,
					descricao,
					amount,
					installments,
					installmentCurrent,
					isoDate,
					installmentGroupId
				);

			statements.push(stmt);
		}

		if (statements.length === 0) {
			return c.json({ error: 'Nenhuma transação com dados válidos (data completa com 4 dígitos no ano, valor e descrição).' }, 400);
		}

		// Gravar em batches de até 100 statements no Cloudflare D1
		const CHUNK_SIZE = 100;
		let insertedCount = 0;
		for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
			const chunk = statements.slice(i, i + CHUNK_SIZE);
			await db.batch(chunk);
			insertedCount += chunk.length;
		}

		return c.json({
			success: true,
			count: insertedCount,
			message: `${insertedCount} transação(ões) importada(s) e gravada(s) com sucesso!`,
		});
	} catch (err: any) {
		console.error('Erro ao confirmar importação:', err);
		return c.json({ error: `Falha ao gravar transações: ${err?.message || 'Erro desconhecido'}` }, 500);
	}
}

// Rotas de confirmação
importRouter.post('/import/confirm', handleConfirm);
importRouter.post('/api/import/confirm', handleConfirm);
importRouter.post('/workspaces/:workspaceId/import/confirm', handleConfirm);

// =========================================================================
// 3. ENDPOINT LEGADO PARA COMPATIBILIDADE COM OFX/CSV
// =========================================================================

importRouter.post('/workspaces/:workspaceId/import/parse', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const formData = await c.req.formData();
		const file = formData.get('file') as File | null;
		const bankPreset = (formData.get('bank') as string) || 'generic';
		const creditCardId = (formData.get('creditCardId') as string) || null;

		if (!file || typeof file === 'string') {
			return c.json({ error: 'Nenhum arquivo enviado. Por favor, selecione um arquivo .ofx ou .csv' }, 400);
		}

		const fileName = file.name || 'extrato';
		const lowerName = fileName.toLowerCase();

		const arrayBuffer = await file.arrayBuffer();
		let fileContent = '';

		try {
			const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
			fileContent = utf8Decoder.decode(arrayBuffer);
		} catch {
			const latin1Decoder = new TextDecoder('iso-8859-1');
			fileContent = latin1Decoder.decode(arrayBuffer);
		}

		if (!fileContent || fileContent.trim().length === 0) {
			return c.json({ error: 'O arquivo enviado está vazio' }, 400);
		}

		const isOfx =
			lowerName.endsWith('.ofx') ||
			fileContent.includes('<OFX>') ||
			fileContent.includes('OFXHEADER') ||
			fileContent.includes('<STMTTRN>');

		let rawTransactions: ReturnType<typeof parseOFX> = [];

		if (isOfx) {
			rawTransactions = parseOFX(fileContent);
		} else {
			rawTransactions = parseCSV(fileContent, bankPreset);
		}

		if (rawTransactions.length === 0) {
			return c.json(
				{
					error: isOfx
						? 'Nenhuma transação válida encontrada no arquivo OFX. Verifique se o extrato contém blocos <STMTTRN>.'
						: 'Nenhuma transação identificada no CSV. Verifique se o arquivo possui colunas com Data, Descrição e Valor, ou selecione o banco de origem correto.',
				},
				400
			);
		}

		const categoriesResult = await db
			.prepare('SELECT id, name, type FROM categories WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<{ id: number; name: string; type?: string }>();

		const existingCategories = categoriesResult.results || [];

		let existingTransactionsQuery = 'SELECT id, date, amount, description, type FROM transactions WHERE workspace_id = ?';
		const queryParams: any[] = [workspaceId];

		if (creditCardId) {
			existingTransactionsQuery += ' AND credit_card_id = ?';
			queryParams.push(creditCardId);
		}

		const existingTxResult = await db
			.prepare(existingTransactionsQuery)
			.bind(...queryParams)
			.all<ExistingTransactionRef>();

		const existingTransactions = existingTxResult.results || [];

		let duplicatesCount = 0;

		const processedTransactions = rawTransactions.map((raw) => {
			const installmentInfo = detectInstallment(raw.description);
			const cleanDescription = installmentInfo.hasInstallment ? installmentInfo.cleanDescription : raw.description;
			const categorySuggestion = suggestCategory(raw.description, existingCategories);

			const dupResult = checkDuplicate(
				{
					date: raw.date,
					amount: raw.amount,
					description: raw.description,
					type: raw.type,
				},
				existingTransactions
			);

			if (dupResult.isPossibleDuplicate) {
				duplicatesCount++;
			}

			return {
				id: raw.id || crypto.randomUUID(),
				date: raw.date,
				description: raw.description,
				cleanDescription,
				amount: raw.amount,
				rawAmount: raw.rawAmount,
				type: raw.type,
				categoryId: categorySuggestion.categoryId,
				categoryName: categorySuggestion.categoryName,
				creditCardId: creditCardId || null,
				installments: installmentInfo.installmentTotal || 1,
				installmentCurrent: installmentInfo.installmentCurrent || 1,
				duplicateHash: dupResult.duplicateHash,
				isPossibleDuplicate: dupResult.isPossibleDuplicate,
				duplicateReason: dupResult.duplicateReason,
				selected: !dupResult.isPossibleDuplicate,
			};
		});

		return c.json({
			filename: fileName,
			fileType: isOfx ? 'ofx' : 'csv',
			totalCount: processedTransactions.length,
			duplicatesCount,
			newCount: processedTransactions.length - duplicatesCount,
			transactions: processedTransactions,
		});
	} catch (err: any) {
		console.error('Erro ao processar arquivo:', err);
		return c.json({ error: `Falha ao processar o arquivo: ${err?.message || 'Erro desconhecido'}` }, 500);
	}
});

export default importRouter;
