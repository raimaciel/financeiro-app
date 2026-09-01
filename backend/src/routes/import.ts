import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';
import { parseOFX } from '../utils/ofxParser';
import { parseCSV } from '../utils/csvParser';
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

// 1. POST /workspaces/:workspaceId/import/parse - Processar arquivo OFX ou CSV e retornar preview
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

		// Lê conteúdo do arquivo
		const arrayBuffer = await file.arrayBuffer();
		let fileContent = '';

		// Tenta decodificar como UTF-8; se tiver caracteres inválidos, tenta ISO-8859-1 (Latin1)
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

		// Detecta se é OFX ou CSV
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

		// 1. Busca categorias existentes no workspace para auto-categorização
		const categoriesResult = await db
			.prepare('SELECT id, name, type FROM categories WHERE workspace_id = ?')
			.bind(workspaceId)
			.all<{ id: number; name: string; type?: string }>();

		const existingCategories = categoriesResult.results || [];

		// 2. Busca transações existentes no workspace para deduplicação
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

		// 3. Processa cada transação: detecção de parcelamento, categorização e deduplicação
		let duplicatesCount = 0;

		const processedTransactions = rawTransactions.map((raw) => {
			// Detecção de parcelas
			const installmentInfo = detectInstallment(raw.description);
			const cleanDescription = installmentInfo.hasInstallment ? installmentInfo.cleanDescription : raw.description;

			// Auto-categorização
			const categorySuggestion = suggestCategory(raw.description, existingCategories);

			// Deduplicação
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
				selected: !dupResult.isPossibleDuplicate, // Desmarcado por padrão se for duplicata
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

// 2. POST /workspaces/:workspaceId/import/confirm - Gravar transações selecionadas em lote
importRouter.post('/workspaces/:workspaceId/import/confirm', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Usuários viewer não podem importar transações' }, 403);
		}

		const body = await c.req.json();
		const { transactions, creditCardId } = body as {
			transactions: Array<{
				date: string;
				description: string;
				amount: number;
				type: 'income' | 'expense';
				categoryId?: number | null;
				creditCardId?: string | null;
				installments?: number;
				installmentCurrent?: number;
			}>;
			creditCardId?: string | null;
		};

		if (!Array.isArray(transactions) || transactions.length === 0) {
			return c.json({ error: 'Nenhuma transação selecionada para importação' }, 400);
		}

		// Valida cartão de crédito se fornecido
		const targetCreditCardId = creditCardId && typeof creditCardId === 'string' ? creditCardId.trim() : null;
		if (targetCreditCardId) {
			const card = await db
				.prepare('SELECT id FROM credit_cards WHERE id = ? AND workspace_id = ?')
				.bind(targetCreditCardId, workspaceId)
				.first();

			if (!card) {
				return c.json({ error: 'Cartão de crédito selecionado não encontrado neste workspace' }, 400);
			}
		}

		let insertedCount = 0;

		// Prepara as declarações em lote para o D1
		const statements: D1PreparedStatement[] = [];

		for (const tx of transactions) {
			const amount = Number(tx.amount);
			if (isNaN(amount) || amount <= 0) continue;

			if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date.trim())) continue;

			const cleanDate = tx.date.trim();
			const descStr = tx.description ? String(tx.description).trim() : 'Transação Importada';
			const txType = tx.type === 'income' ? 'income' : 'expense';
			const categoryIdNum = tx.categoryId ? Number(tx.categoryId) : null;
			const itemCardId = tx.creditCardId || targetCreditCardId || null;

			const installments = Math.max(1, Math.floor(Number(tx.installments) || 1));
			const installmentCurrent = Math.max(1, Math.floor(Number(tx.installmentCurrent) || 1));
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
					itemCardId,
					txType,
					descStr,
					amount,
					installments,
					installmentCurrent,
					cleanDate,
					installmentGroupId
				);

			statements.push(stmt);
		}

		if (statements.length === 0) {
			return c.json({ error: 'Nenhuma transação com dados válidos para gravação' }, 400);
		}

		// Executa lote no D1
		// D1 batch suporta até 100 statements por batch; divide em chunks se necessário
		const CHUNK_SIZE = 100;
		for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
			const chunk = statements.slice(i, i + CHUNK_SIZE);
			await db.batch(chunk);
			insertedCount += chunk.length;
		}

		return c.json({
			success: true,
			count: insertedCount,
			message: `${insertedCount} transação(ões) importada(s) com sucesso!`,
		});
	} catch (err: any) {
		console.error('Erro ao confirmar importação:', err);
		return c.json({ error: `Falha ao gravar transações: ${err?.message || 'Erro desconhecido'}` }, 500);
	}
});

export default importRouter;
