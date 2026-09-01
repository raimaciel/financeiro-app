import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const transactionsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de transações com authMiddleware
transactionsRouter.use('*', authMiddleware);

// Helper para verificar papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// Helper para incrementar meses em datas YYYY-MM-DD
function addMonthsToDateString(dateStr: string, monthsToAdd: number): string {
	const parts = dateStr.split('-');
	if (parts.length !== 3) return dateStr;

	const year = parseInt(parts[0], 10);
	const month = parseInt(parts[1], 10) - 1; // 0-indexed
	const day = parseInt(parts[2], 10);

	const targetDate = new Date(year, month + monthsToAdd, 1);
	const targetYear = targetDate.getFullYear();
	const targetMonth = targetDate.getMonth();

	const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
	const safeDay = Math.min(day, maxDay);

	const yyyy = targetYear;
	const mm = String(targetMonth + 1).padStart(2, '0');
	const dd = String(safeDay).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

// Helper para obter mês atual no formato YYYY-MM
function getCurrentYearMonth(): string {
	const now = new Date();
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	return `${yyyy}-${mm}`;
}

// 1. POST /workspaces/:workspaceId/transactions - Criar transação (simples ou parcelada)
transactionsRouter.post('/workspaces/:workspaceId/transactions', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem criar transações' }, 403);
		}

		const body = await c.req.json();
		const { category_id, credit_card_id, type, description, amount, installments, date, receipt_url } = body;

		if (!type || !['income', 'expense'].includes(type)) {
			return c.json({ error: 'Tipo inválido. Deve ser "income" ou "expense"' }, 400);
		}

		const amountNum = Number(amount);
		if (isNaN(amountNum) || amountNum <= 0) {
			return c.json({ error: 'Valor da transação deve ser um número positivo' }, 400);
		}

		if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
			return c.json({ error: 'Data inválida. Deve estar no formato YYYY-MM-DD' }, 400);
		}

		const cleanDate = date.trim();
		const categoryIdNum = category_id !== undefined && category_id !== null ? Number(category_id) : null;
		const creditCardIdStr = credit_card_id && typeof credit_card_id === 'string' ? credit_card_id.trim() : null;

		// Verificar se category_id pertence ao mesmo workspace
		if (categoryIdNum !== null) {
			const category = await db
				.prepare('SELECT id FROM categories WHERE id = ? AND workspace_id = ?')
				.bind(categoryIdNum, workspaceId)
				.first();

			if (!category) {
				return c.json({ error: 'Categoria não encontrada ou não pertence a este workspace' }, 400);
			}
		}

		// Verificar se credit_card_id pertence ao mesmo workspace
		if (creditCardIdStr !== null) {
			const card = await db
				.prepare('SELECT id FROM credit_cards WHERE id = ? AND workspace_id = ?')
				.bind(creditCardIdStr, workspaceId)
				.first();

			if (!card) {
				return c.json({ error: 'Cartão de crédito não encontrado ou não pertence a este workspace' }, 400);
			}
		}

		const numInstallments = Math.max(1, Math.floor(Number(installments) || 1));
		const installmentGroupId = numInstallments > 1 ? crypto.randomUUID() : null;
		const installmentAmount = Number((amountNum / numInstallments).toFixed(2));
		const descStr = description && typeof description === 'string' ? description.trim() : null;
		const receiptStr = receipt_url && typeof receipt_url === 'string' ? receipt_url.trim() : null;

		const createdTransactions: any[] = [];

		for (let i = 1; i <= numInstallments; i++) {
			const currentInstallmentDate = addMonthsToDateString(cleanDate, i - 1);

			const result = await db
				.prepare(`
					INSERT INTO transactions 
					(workspace_id, user_id, category_id, credit_card_id, type, description, amount, installments, installment_current, date, receipt_url, installment_group_id)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				.bind(
					workspaceId,
					userId,
					categoryIdNum,
					creditCardIdStr,
					type,
					descStr,
					installmentAmount,
					numInstallments,
					i,
					currentInstallmentDate,
					receiptStr,
					installmentGroupId
				)
				.run();

			const insertedId = result.meta.last_row_id;

			createdTransactions.push({
				id: insertedId,
				workspace_id: workspaceId,
				user_id: userId,
				category_id: categoryIdNum,
				credit_card_id: creditCardIdStr,
				type,
				description: descStr,
				amount: installmentAmount,
				installments: numInstallments,
				installment_current: i,
				installment_group_id: installmentGroupId,
				date: currentInstallmentDate,
				receipt_url: receiptStr,
			});
		}

		return c.json(numInstallments > 1 ? createdTransactions : createdTransactions[0], 201);
	} catch (err) {
		console.error('Erro ao criar transação:', err);
		return c.json({ error: 'Erro ao criar transação' }, 500);
	}
});

// 3. GET /workspaces/:workspaceId/transactions/summary & /workspaces/:workspaceId/summary - Resumo do mês
const summaryHandler = async (c: any) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const monthFilter = c.req.query('month') || getCurrentYearMonth();
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const monthPattern = `${monthFilter}-%`;

		// Total Income
		const incomeResult = await db
			.prepare(`
				SELECT COALESCE(SUM(amount), 0) as total
				FROM transactions
				WHERE workspace_id = ? AND type = 'income' AND date LIKE ?
			`)
			.bind(workspaceId, monthPattern)
			.first<{ total: number }>();

		const totalIncome = incomeResult?.total || 0;

		// Total Expense
		const expenseResult = await db
			.prepare(`
				SELECT COALESCE(SUM(amount), 0) as total
				FROM transactions
				WHERE workspace_id = ? AND type = 'expense' AND date LIKE ?
			`)
			.bind(workspaceId, monthPattern)
			.first<{ total: number }>();

		const totalExpense = expenseResult?.total || 0;
		const balance = Number((totalIncome - totalExpense).toFixed(2));

		// By Category
		const { results: byCategory } = await db
			.prepare(`
				SELECT 
					t.category_id as category_id,
					c.name as name,
					c.icon as icon,
					c.color as color,
					ROUND(SUM(t.amount), 2) as total
				FROM transactions t
				LEFT JOIN categories c ON c.id = t.category_id
				WHERE t.workspace_id = ? AND t.date LIKE ?
				GROUP BY t.category_id, c.name, c.icon, c.color
				ORDER BY total DESC
			`)
			.bind(workspaceId, monthPattern)
			.all<any>();

		return c.json({
			month: monthFilter,
			total_income: Number(totalIncome.toFixed(2)),
			total_expense: Number(totalExpense.toFixed(2)),
			balance,
			by_category: byCategory || [],
		});
	} catch (err) {
		console.error('Erro ao obter resumo de transações:', err);
		return c.json({ error: 'Erro ao obter resumo de transações' }, 500);
	}
};

transactionsRouter.get('/workspaces/:workspaceId/transactions/summary', summaryHandler);
transactionsRouter.get('/workspaces/:workspaceId/summary', summaryHandler);

// 2. GET /workspaces/:workspaceId/transactions - Listar transações com filtros
transactionsRouter.get('/workspaces/:workspaceId/transactions', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const typeFilter = c.req.query('type');
		const categoryIdFilter = c.req.query('category_id');
		const creditCardIdFilter = c.req.query('credit_card_id');
		const monthFilter = c.req.query('month');
		const groupFilter = c.req.query('installment_group_id');

		let sql = `
			SELECT 
				t.id,
				t.workspace_id as workspaceId,
				t.user_id as userId,
				t.category_id as categoryId,
				t.credit_card_id as creditCardId,
				t.type,
				t.description,
				t.amount,
				t.installments,
				t.installment_current as installmentCurrent,
				t.installment_group_id as installmentGroupId,
				t.date,
				t.receipt_url as receiptUrl,
				t.attachment_name as attachmentName,
				t.attachment_type as attachmentType,
				t.attachment_size as attachmentSize,
				t.created_at as createdAt,
				c.name as category_name,
				c.icon as category_icon,
				c.color as category_color,
				cc.name as credit_card_name
			FROM transactions t
			LEFT JOIN categories c ON c.id = t.category_id
			LEFT JOIN credit_cards cc ON cc.id = t.credit_card_id
			WHERE t.workspace_id = ?
		`;

		const params: any[] = [workspaceId];

		if (typeFilter && ['income', 'expense'].includes(typeFilter)) {
			sql += ' AND t.type = ?';
			params.push(typeFilter);
		}

		if (categoryIdFilter) {
			sql += ' AND t.category_id = ?';
			params.push(Number(categoryIdFilter));
		}

		if (creditCardIdFilter) {
			sql += ' AND t.credit_card_id = ?';
			params.push(creditCardIdFilter);
		}

		if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
			sql += ' AND t.date LIKE ?';
			params.push(`${monthFilter}-%`);
		}

		if (groupFilter) {
			sql += ' AND t.installment_group_id = ?';
			params.push(groupFilter);
		}

		sql += ' ORDER BY t.date DESC, t.id DESC';

		const { results } = await db.prepare(sql).bind(...params).all();

		return c.json(results || []);
	} catch (err) {
		console.error('Erro ao listar transações:', err);
		return c.json({ error: 'Erro ao listar transações' }, 500);
	}
});

// 4. PUT /workspaces/:workspaceId/transactions/:id - Atualizar transação individual
transactionsRouter.put('/workspaces/:workspaceId/transactions/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const transactionId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem editar transações' }, 403);
		}

		const existing = await db
			.prepare('SELECT * FROM transactions WHERE id = ? AND workspace_id = ?')
			.bind(transactionId, workspaceId)
			.first<any>();

		if (!existing) {
			return c.json({ error: 'Transação não encontrada' }, 404);
		}

		const body = await c.req.json();
		const amount = body.amount !== undefined ? Number(body.amount) : existing.amount;
		const description = body.description !== undefined ? String(body.description).trim() : existing.description;
		const date = body.date !== undefined ? String(body.date).trim() : existing.date;
		const categoryId = body.category_id !== undefined ? (body.category_id ? Number(body.category_id) : null) : existing.category_id;
		const creditCardId = body.credit_card_id !== undefined ? (body.credit_card_id ? String(body.credit_card_id).trim() : null) : existing.credit_card_id;
		const type = body.type !== undefined && ['income', 'expense'].includes(body.type) ? body.type : existing.type;
		const receiptUrl = body.receipt_url !== undefined ? (body.receipt_url ? String(body.receipt_url).trim() : null) : existing.receipt_url;

		if (isNaN(amount) || amount <= 0) {
			return c.json({ error: 'Valor da transação deve ser um número positivo' }, 400);
		}

		// Validar categoria se fornecida
		if (categoryId !== null) {
			const cat = await db
				.prepare('SELECT id FROM categories WHERE id = ? AND workspace_id = ?')
				.bind(categoryId, workspaceId)
				.first();

			if (!cat) {
				return c.json({ error: 'Categoria não encontrada ou não pertence a este workspace' }, 400);
			}
		}

		// Validar cartão se fornecido
		if (creditCardId !== null) {
			const card = await db
				.prepare('SELECT id FROM credit_cards WHERE id = ? AND workspace_id = ?')
				.bind(creditCardId, workspaceId)
				.first();

			if (!card) {
				return c.json({ error: 'Cartão de crédito não encontrado ou não pertence a este workspace' }, 400);
			}
		}

		await db
			.prepare(`
				UPDATE transactions
				SET category_id = ?, credit_card_id = ?, type = ?, description = ?, amount = ?, date = ?, receipt_url = ?
				WHERE id = ? AND workspace_id = ?
			`)
			.bind(categoryId, creditCardId, type, description, amount, date, receiptUrl, transactionId, workspaceId)
			.run();

		return c.json({
			id: Number(transactionId),
			workspace_id: workspaceId,
			user_id: existing.user_id,
			category_id: categoryId,
			credit_card_id: creditCardId,
			type,
			description,
			amount,
			installments: existing.installments,
			installment_current: existing.installment_current,
			installment_group_id: existing.installment_group_id,
			date,
			receipt_url: receiptUrl,
		}, 200);
	} catch (err) {
		console.error('Erro ao atualizar transação:', err);
		return c.json({ error: 'Erro ao atualizar transação' }, 500);
	}
});

// 5. DELETE /workspaces/:workspaceId/transactions/:id - Deletar transação
transactionsRouter.delete('/workspaces/:workspaceId/transactions/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const transactionId = c.req.param('id');
		const userId = String(c.get('userId'));
		const deleteAllGroup = c.req.query('all') === 'true';
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem deletar transações' }, 403);
		}

		const existing = await db
			.prepare('SELECT id, installment_group_id FROM transactions WHERE id = ? AND workspace_id = ?')
			.bind(transactionId, workspaceId)
			.first<{ id: number; installment_group_id: string | null }>();

		if (!existing) {
			return c.json({ error: 'Transação não encontrada' }, 404);
		}

		if (deleteAllGroup && existing.installment_group_id) {
			await db
				.prepare('DELETE FROM transactions WHERE workspace_id = ? AND installment_group_id = ?')
				.bind(workspaceId, existing.installment_group_id)
				.run();

			return c.json({ message: 'Todas as parcelas do grupo foram removidas com sucesso' }, 200);
		} else {
			await db
				.prepare('DELETE FROM transactions WHERE id = ? AND workspace_id = ?')
				.bind(transactionId, workspaceId)
				.run();

			return c.json({ message: 'Transação removida com sucesso' }, 200);
		}
	} catch (err) {
		console.error('Erro ao deletar transação:', err);
		return c.json({ error: 'Erro ao deletar transação' }, 500);
	}
});

// 6. POST /transactions/:id/attachment & /workspaces/:workspaceId/transactions/:id/attachment - Upload de anexo
const uploadAttachmentHandler = async (c: any) => {
	try {
		const transactionId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;
		const r2 = c.env.financeiro_comprovantes;

		if (!r2) {
			return c.json({ error: 'Bucket R2 não configurado no backend' }, 500);
		}

		// Buscar transação
		const transaction = await db
			.prepare('SELECT id, workspace_id, receipt_url FROM transactions WHERE id = ?')
			.bind(transactionId)
			.first<any>();

		if (!transaction) {
			return c.json({ error: 'Transação não encontrada' }, 404);
		}

		const workspaceId = transaction.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros viewer não podem anexar comprovantes' }, 403);
		}

		// Parse multipart form data
		const body = await c.req.parseBody();
		const file = body['file'];

		if (!file || !(file instanceof File)) {
			return c.json({ error: 'Arquivo inválido ou não fornecido' }, 400);
		}

		// Validações
		const MAX_SIZE = 5 * 1024 * 1024; // 5MB
		if (file.size > MAX_SIZE) {
			return c.json({ error: 'O tamanho do arquivo excede o limite máximo permitido de 5MB' }, 400);
		}

		const allowedTypes = [
			'image/jpeg',
			'image/png',
			'image/webp',
			'image/gif',
			'application/pdf',
		];

		if (!allowedTypes.includes(file.type)) {
			return c.json({ error: 'Tipo de arquivo não suportado. Use JPG, PNG, WEBP ou PDF' }, 400);
		}

		// Se já existia um anexo anterior, deletar do R2
		if (transaction.receipt_url) {
			try {
				await r2.delete(transaction.receipt_url);
			} catch (deleteErr) {
				console.warn('Não foi possível remover arquivo anterior do R2:', deleteErr);
			}
		}

		// Gerar chave única no R2
		const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const key = `workspaces/${workspaceId}/transactions/${transactionId}/${Date.now()}-${sanitizedFileName}`;

		const arrayBuffer = await file.arrayBuffer();

		await r2.put(key, arrayBuffer, {
			httpMetadata: {
				contentType: file.type,
			},
			customMetadata: {
				originalName: file.name,
				uploadedBy: userId,
			},
		});

		// Atualizar no D1
		await db
			.prepare(`
				UPDATE transactions
				SET receipt_url = ?, attachment_name = ?, attachment_type = ?, attachment_size = ?
				WHERE id = ? AND workspace_id = ?
			`)
			.bind(key, file.name, file.type, file.size, transactionId, workspaceId)
			.run();

		return c.json({
			message: 'Comprovante anexado com sucesso',
			receipt_url: key,
			attachment_name: file.name,
			attachment_type: file.type,
			attachment_size: file.size,
			url: `/transactions/${transactionId}/attachment`,
		}, 200);
	} catch (err) {
		console.error('Erro ao fazer upload de anexo:', err);
		return c.json({ error: 'Erro ao processar anexo' }, 500);
	}
};

transactionsRouter.post('/transactions/:id/attachment', uploadAttachmentHandler);
transactionsRouter.post('/workspaces/:workspaceId/transactions/:id/attachment', uploadAttachmentHandler);

// 7. GET /transactions/:id/attachment & /workspaces/:workspaceId/transactions/:id/attachment - Download/Visualização de anexo
const getAttachmentHandler = async (c: any) => {
	try {
		const transactionId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;
		const r2 = c.env.financeiro_comprovantes;

		if (!r2) {
			return c.json({ error: 'Bucket R2 não configurado' }, 500);
		}

		const transaction = await db
			.prepare('SELECT id, workspace_id, receipt_url, attachment_name, attachment_type FROM transactions WHERE id = ?')
			.bind(transactionId)
			.first<any>();

		if (!transaction || !transaction.receipt_url) {
			return c.json({ error: 'Anexo não encontrado para esta transação' }, 404);
		}

		const workspaceId = transaction.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const object = await r2.get(transaction.receipt_url);

		if (!object) {
			return c.json({ error: 'Arquivo não encontrado no armazenamento' }, 404);
		}

		const contentType = object.httpMetadata?.contentType || transaction.attachment_type || 'application/octet-stream';
		const fileName = transaction.attachment_name || 'anexo';

		return new Response(object.body, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': `inline; filename="${fileName}"`,
				'Cache-Control': 'public, max-age=86400',
			},
		});
	} catch (err) {
		console.error('Erro ao obter anexo:', err);
		return c.json({ error: 'Erro ao carregar anexo' }, 500);
	}
};

transactionsRouter.get('/transactions/:id/attachment', getAttachmentHandler);
transactionsRouter.get('/workspaces/:workspaceId/transactions/:id/attachment', getAttachmentHandler);

// 8. DELETE /transactions/:id/attachment & /workspaces/:workspaceId/transactions/:id/attachment - Remover anexo
const deleteAttachmentHandler = async (c: any) => {
	try {
		const transactionId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;
		const r2 = c.env.financeiro_comprovantes;

		const transaction = await db
			.prepare('SELECT id, workspace_id, receipt_url FROM transactions WHERE id = ?')
			.bind(transactionId)
			.first<any>();

		if (!transaction) {
			return c.json({ error: 'Transação não encontrada' }, 404);
		}

		const workspaceId = transaction.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros viewer não podem remover anexos' }, 403);
		}

		if (transaction.receipt_url && r2) {
			try {
				await r2.delete(transaction.receipt_url);
			} catch (deleteErr) {
				console.warn('Erro ao deletar arquivo do R2:', deleteErr);
			}
		}

		await db
			.prepare(`
				UPDATE transactions
				SET receipt_url = NULL, attachment_name = NULL, attachment_type = NULL, attachment_size = NULL
				WHERE id = ? AND workspace_id = ?
			`)
			.bind(transactionId, workspaceId)
			.run();

		return c.json({ message: 'Comprovante removido com sucesso' }, 200);
	} catch (err) {
		console.error('Erro ao remover anexo:', err);
		return c.json({ error: 'Erro ao remover anexo' }, 500);
	}
};

transactionsRouter.delete('/transactions/:id/attachment', deleteAttachmentHandler);
transactionsRouter.delete('/workspaces/:workspaceId/transactions/:id/attachment', deleteAttachmentHandler);

export default transactionsRouter;
