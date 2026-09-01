import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const creditCardsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Proteger todas as rotas de cartões com authMiddleware
creditCardsRouter.use('*', authMiddleware);

// Função utilitária para calcular o melhor dia de compra
function calcularMelhorDiaCompra(closingDay: number): number {
	return closingDay === 31 ? 1 : closingDay + 1;
}

function getSafeDate(year: number, month: number, day: number): Date {
	const maxDay = new Date(year, month + 1, 0).getDate();
	const safeDay = Math.min(day, maxDay);
	return new Date(year, month, safeDay);
}

function formatDate(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

// Função utilitária para calcular datas da fatura
function calcularDatasCartao(closingDay: number, dueDay: number, now: Date = new Date()) {
	const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	let closingYear = now.getFullYear();
	let closingMonth = now.getMonth();

	if (now.getDate() > closingDay) {
		closingMonth += 1;
	}

	const nextClosingDate = getSafeDate(closingYear, closingMonth, closingDay);
	const nextDueDate = getSafeDate(nextClosingDate.getFullYear(), nextClosingDate.getMonth() + 1, dueDay);

	const diffTime = nextDueDate.getTime() - todayMidnight.getTime();
	const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	return {
		next_closing_date: formatDate(nextClosingDate),
		next_due_date: formatDate(nextDueDate),
		days_until_due: daysUntilDue,
	};
}

// Helper para verificar o papel do membro no workspace
async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// Validação de tipo de cartão
function validateCardType(cardTypeInput: any): { valid: boolean; value?: string; error?: string } {
	if (cardTypeInput === undefined || cardTypeInput === null || cardTypeInput === '') {
		return { valid: true, value: 'physical' };
	}
	const val = String(cardTypeInput).trim().toLowerCase();
	if (!['physical', 'virtual'].includes(val)) {
		return { valid: false, error: 'card_type inválido. Use "physical" ou "virtual".' };
	}
	return { valid: true, value: val };
}

// Validação de últimos 4 dígitos (segurança: apenas 4 dígitos numéricos)
function validateLastFourDigits(digitsInput: any): { valid: boolean; value?: string | null; error?: string } {
	if (digitsInput === undefined || digitsInput === null || digitsInput === '') {
		return { valid: true, value: null };
	}
	const val = String(digitsInput).trim();
	if (!/^\d{4}$/.test(val)) {
		return { valid: false, error: 'last_four_digits deve conter exatamente 4 números.' };
	}
	return { valid: true, value: val };
}

// Helper para formatar a resposta do cartão com compatibilidade snake_case e camelCase
function formatCreditCardResponse(card: any, closingDay: number, dueDay: number) {
	const calculatedDates = calcularDatasCartao(closingDay, dueDay);
	const cardType = card.card_type || 'physical';
	const lastFourDigits = card.last_four_digits ?? null;
	const bankName = card.bank_name ?? null;
	const institution = card.institution ?? null;
	const cardTier = card.card_tier || 'standard';
	const cardImageUrl = card.card_image_url ?? null;

	return {
		id: card.id,
		workspace_id: card.workspace_id,
		name: card.name,
		brand: card.brand ?? null,
		limit_amount: Number(card.limit_amount ?? 0),
		limit: Number(card.limit_amount ?? 0),
		closing_day: Number(card.closing_day),
		closingDay: Number(card.closing_day),
		due_day: Number(card.due_day),
		dueDay: Number(card.due_day),
		best_purchase_day: Number(card.best_purchase_day),
		bestPurchaseDay: Number(card.best_purchase_day),
		color: card.color || '#000000',
		card_type: cardType,
		cardType: cardType,
		last_four_digits: lastFourDigits,
		lastFourDigits: lastFourDigits,
		bank_name: bankName,
		bankName: bankName,
		institution: institution,
		card_tier: cardTier,
		cardTier: cardTier,
		card_image_url: cardImageUrl,
		cardImageUrl: cardImageUrl,
		image_url: cardImageUrl ? `/cards/${card.id}/image` : null,
		imageUrl: cardImageUrl ? `/cards/${card.id}/image` : null,
		created_at: card.created_at,
		...calculatedDates,
	};
}

// 1. POST /workspaces/:workspaceId/credit-cards - Criar cartão de crédito
creditCardsRouter.post('/workspaces/:workspaceId/credit-cards', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem cadastrar cartões' }, 403);
		}

		const body = await c.req.json();
		const {
			name,
			brand,
			limit_amount,
			limit,
			closing_day,
			closingDay,
			due_day,
			dueDay,
			color,
			card_type,
			cardType,
			last_four_digits,
			lastFourDigits,
			bank_name,
			bankName,
			institution,
			card_tier,
			cardTier,
		} = body;

		if (!name || typeof name !== 'string' || name.trim() === '') {
			return c.json({ error: 'Nome do cartão é obrigatório' }, 400);
		}

		const closingDayNum = Number(closing_day !== undefined ? closing_day : closingDay);
		const dueDayNum = Number(due_day !== undefined ? due_day : dueDay);

		if (isNaN(closingDayNum) || closingDayNum < 1 || closingDayNum > 31) {
			return c.json({ error: 'Dia de fechamento inválido (deve ser entre 1 e 31)' }, 400);
		}

		if (isNaN(dueDayNum) || dueDayNum < 1 || dueDayNum > 31) {
			return c.json({ error: 'Dia de vencimento inválido (deve ser entre 1 e 31)' }, 400);
		}

		const typeResult = validateCardType(card_type !== undefined ? card_type : cardType);
		if (!typeResult.valid) {
			return c.json({ error: typeResult.error }, 400);
		}

		const digitsResult = validateLastFourDigits(last_four_digits !== undefined ? last_four_digits : lastFourDigits);
		if (!digitsResult.valid) {
			return c.json({ error: digitsResult.error }, 400);
		}

		const cardBrand = brand && typeof brand === 'string' ? brand.trim() : null;
		const rawLimit = limit_amount !== undefined ? limit_amount : limit;
		const limitAmountNum = rawLimit !== undefined && !isNaN(Number(rawLimit)) ? Number(rawLimit) : 0;
		const cardColor = color && typeof color === 'string' ? color.trim() : '#000000';
		const bankNameVal = (bank_name !== undefined ? bank_name : bankName) ? String(bank_name !== undefined ? bank_name : bankName).trim() : null;
		const institutionVal = institution ? String(institution).trim() : null;
		const cardTierVal = (card_tier !== undefined ? card_tier : cardTier) ? String(card_tier !== undefined ? card_tier : cardTier).trim() : 'standard';
		const bestPurchaseDay = calcularMelhorDiaCompra(closingDayNum);
		const cardId = crypto.randomUUID();

		await db
			.prepare(`
				INSERT INTO credit_cards (
					id, workspace_id, name, brand, limit_amount, closing_day, due_day, best_purchase_day, color,
					card_type, last_four_digits, bank_name, institution, card_tier
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.bind(
				cardId,
				workspaceId,
				name.trim(),
				cardBrand,
				limitAmountNum,
				closingDayNum,
				dueDayNum,
				bestPurchaseDay,
				cardColor,
				typeResult.value,
				digitsResult.value,
				bankNameVal,
				institutionVal,
				cardTierVal
			)
			.run();

		const createdCard = formatCreditCardResponse(
			{
				id: cardId,
				workspace_id: workspaceId,
				name: name.trim(),
				brand: cardBrand,
				limit_amount: limitAmountNum,
				closing_day: closingDayNum,
				due_day: dueDayNum,
				best_purchase_day: bestPurchaseDay,
				color: cardColor,
				card_type: typeResult.value,
				last_four_digits: digitsResult.value,
				bank_name: bankNameVal,
				institution: institutionVal,
				card_tier: cardTierVal,
				card_image_url: null,
				created_at: new Date().toISOString(),
			},
			closingDayNum,
			dueDayNum
		);

		return c.json(createdCard, 201);
	} catch (err) {
		console.error('Erro ao criar cartão de crédito:', err);
		return c.json({ error: 'Erro ao criar cartão de crédito' }, 500);
	}
});

// 2. GET /workspaces/:workspaceId/credit-cards - Listar cartões do workspace
creditCardsRouter.get('/workspaces/:workspaceId/credit-cards', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const { results } = await db
			.prepare(`
				SELECT id, workspace_id, name, brand, limit_amount, closing_day, due_day, best_purchase_day, color,
				       card_type, last_four_digits, bank_name, institution, card_tier, card_image_url, created_at
				FROM credit_cards
				WHERE workspace_id = ?
				ORDER BY name ASC
			`)
			.bind(workspaceId)
			.all<any>();

		const cardsWithCalculatedDates = (results || []).map((card) =>
			formatCreditCardResponse(card, Number(card.closing_day), Number(card.due_day))
		);

		return c.json(cardsWithCalculatedDates);
	} catch (err) {
		console.error('Erro ao listar cartões de crédito:', err);
		return c.json({ error: 'Erro ao listar cartões de crédito' }, 500);
	}
});

// 3. GET /workspaces/:workspaceId/credit-cards/:id - Obter detalhes de um cartão
creditCardsRouter.get('/workspaces/:workspaceId/credit-cards/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const card = await db
			.prepare(`
				SELECT id, workspace_id, name, brand, limit_amount, closing_day, due_day, best_purchase_day, color,
				       card_type, last_four_digits, bank_name, institution, card_tier, card_image_url, created_at
				FROM credit_cards
				WHERE id = ? AND workspace_id = ?
			`)
			.bind(cardId, workspaceId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		return c.json(formatCreditCardResponse(card, Number(card.closing_day), Number(card.due_day)), 200);
	} catch (err) {
		console.error('Erro ao obter detalhes do cartão:', err);
		return c.json({ error: 'Erro ao obter detalhes do cartão de crédito' }, 500);
	}
});

// Handler centralizado de atualização de cartão
async function updateCreditCardHandler(c: any, workspaceId: string, cardId: string, userId: string) {
	try {
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem editar cartões' }, 403);
		}

		const existingCard = await db
			.prepare('SELECT * FROM credit_cards WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.first<any>();

		if (!existingCard) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const body = await c.req.json();
		const name = body.name !== undefined ? String(body.name).trim() : existingCard.name;
		if (body.name !== undefined && !name) {
			return c.json({ error: 'Nome do cartão não pode ser vazio' }, 400);
		}

		const brandInput = body.brand !== undefined ? body.brand : existingCard.brand;
		const brand = brandInput !== null && brandInput !== undefined ? String(brandInput).trim() : null;

		const rawLimit = body.limit_amount !== undefined ? body.limit_amount : (body.limit !== undefined ? body.limit : existingCard.limit_amount);
		const limitAmount = rawLimit !== undefined && rawLimit !== null && !isNaN(Number(rawLimit)) ? Number(rawLimit) : 0;

		const rawClosingDay = body.closing_day !== undefined ? body.closing_day : (body.closingDay !== undefined ? body.closingDay : existingCard.closing_day);
		const closingDay = Number(rawClosingDay);

		const rawDueDay = body.due_day !== undefined ? body.due_day : (body.dueDay !== undefined ? body.dueDay : existingCard.due_day);
		const dueDay = Number(rawDueDay);

		if (isNaN(closingDay) || closingDay < 1 || closingDay > 31) {
			return c.json({ error: 'Dia de fechamento inválido (deve ser entre 1 e 31)' }, 400);
		}

		if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
			return c.json({ error: 'Dia de vencimento inválido (deve ser entre 1 e 31)' }, 400);
		}

		const cardTypeRaw = body.card_type !== undefined ? body.card_type : (body.cardType !== undefined ? body.cardType : undefined);
		let cardType = existingCard.card_type || 'physical';
		if (cardTypeRaw !== undefined) {
			const typeRes = validateCardType(cardTypeRaw);
			if (!typeRes.valid) {
				return c.json({ error: typeRes.error }, 400);
			}
			cardType = typeRes.value!;
		}

		const lastFourDigitsRaw = body.last_four_digits !== undefined ? body.last_four_digits : (body.lastFourDigits !== undefined ? body.lastFourDigits : undefined);
		let lastFourDigits = existingCard.last_four_digits ?? null;
		if (lastFourDigitsRaw !== undefined) {
			const digitsRes = validateLastFourDigits(lastFourDigitsRaw);
			if (!digitsRes.valid) {
				return c.json({ error: digitsRes.error }, 400);
			}
			lastFourDigits = digitsRes.value ?? null;
		}

		const bankNameRaw = body.bank_name !== undefined ? body.bank_name : (body.bankName !== undefined ? body.bankName : undefined);
		let bankName = existingCard.bank_name ?? null;
		if (bankNameRaw !== undefined) {
			bankName = bankNameRaw ? String(bankNameRaw).trim() : null;
		}

		const institutionRaw = body.institution !== undefined ? body.institution : undefined;
		let institution = existingCard.institution ?? null;
		if (institutionRaw !== undefined) {
			institution = institutionRaw ? String(institutionRaw).trim() : null;
		}

		const cardTierRaw = body.card_tier !== undefined ? body.card_tier : (body.cardTier !== undefined ? body.cardTier : undefined);
		let cardTier = existingCard.card_tier || 'standard';
		if (cardTierRaw !== undefined) {
			cardTier = cardTierRaw ? String(cardTierRaw).trim() : 'standard';
		}

		const colorRaw = body.color !== undefined ? body.color : existingCard.color;
		const color = colorRaw ? String(colorRaw).trim() : '#000000';

		const bestPurchaseDay = calcularMelhorDiaCompra(closingDay);

		await db
			.prepare(`
				UPDATE credit_cards
				SET name = ?, brand = ?, limit_amount = ?, closing_day = ?, due_day = ?, best_purchase_day = ?, color = ?,
				    card_type = ?, last_four_digits = ?, bank_name = ?, institution = ?, card_tier = ?
				WHERE id = ? AND workspace_id = ?
			`)
			.bind(
				name,
				brand,
				limitAmount,
				closingDay,
				dueDay,
				bestPurchaseDay,
				color,
				cardType,
				lastFourDigits,
				bankName,
				institution,
				cardTier,
				cardId,
				workspaceId
			)
			.run();

		const responseCard = formatCreditCardResponse(
			{
				id: cardId,
				workspace_id: workspaceId,
				name,
				brand,
				limit_amount: limitAmount,
				closing_day: closingDay,
				due_day: dueDay,
				best_purchase_day: bestPurchaseDay,
				color,
				card_type: cardType,
				last_four_digits: lastFourDigits,
				bank_name: bankName,
				institution,
				card_tier: cardTier,
				card_image_url: existingCard.card_image_url ?? null,
				created_at: existingCard.created_at,
			},
			closingDay,
			dueDay
		);

		return c.json({
			success: true,
			...responseCard,
		}, 200);
	} catch (err: any) {
		console.error('Erro ao atualizar cartão de crédito:', err);
		return c.json({ error: 'Erro ao atualizar cartão.', details: err?.message }, 500);
	}
}

// 4. PUT /workspaces/:workspaceId/credit-cards/:id - Atualizar cartão
creditCardsRouter.put('/workspaces/:workspaceId/credit-cards/:id', async (c) => {
	const workspaceId = c.req.param('workspaceId');
	const cardId = c.req.param('id');
	const userId = String(c.get('userId'));
	return updateCreditCardHandler(c, workspaceId, cardId, userId);
});

// PATCH /workspaces/:workspaceId/credit-cards/:id - Atualizar parcialmente cartão
creditCardsRouter.patch('/workspaces/:workspaceId/credit-cards/:id', async (c) => {
	const workspaceId = c.req.param('workspaceId');
	const cardId = c.req.param('id');
	const userId = String(c.get('userId'));
	return updateCreditCardHandler(c, workspaceId, cardId, userId);
});

// GET /cards/:id - Obter detalhes direto por ID
creditCardsRouter.get('/cards/:id', async (c) => {
	try {
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const card = await db
			.prepare(`
				SELECT id, workspace_id, name, brand, limit_amount, closing_day, due_day, best_purchase_day, color,
				       card_type, last_four_digits, bank_name, institution, card_tier, card_image_url, created_at
				FROM credit_cards
				WHERE id = ?
			`)
			.bind(cardId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const role = await getWorkspaceMemberRole(db, card.workspace_id, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		return c.json(formatCreditCardResponse(card, Number(card.closing_day), Number(card.due_day)), 200);
	} catch (err) {
		console.error('Erro ao obter detalhes do cartão:', err);
		return c.json({ error: 'Erro ao obter detalhes do cartão de crédito' }, 500);
	}
});

// PATCH /cards/:id - Atualizar cartão direto por ID
creditCardsRouter.patch('/cards/:id', async (c) => {
	try {
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const card = await db
			.prepare('SELECT workspace_id FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<{ workspace_id: string }>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		return await updateCreditCardHandler(c, card.workspace_id, cardId, userId);
	} catch (err: any) {
		console.error('Erro ao atualizar cartão:', err);
		return c.json({ error: 'Erro ao atualizar cartão.', details: err?.message }, 500);
	}
});

// PUT /cards/:id - Atualizar cartão direto por ID
creditCardsRouter.put('/cards/:id', async (c) => {
	try {
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const card = await db
			.prepare('SELECT workspace_id FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<{ workspace_id: string }>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		return await updateCreditCardHandler(c, card.workspace_id, cardId, userId);
	} catch (err: any) {
		console.error('Erro ao atualizar cartão:', err);
		return c.json({ error: 'Erro ao atualizar cartão.', details: err?.message }, 500);
	}
});

// POST /workspaces/:workspaceId/credit-cards/:id/image & /cards/:id/image - Upload de foto do cartão
const uploadCardImageHandler = async (c: any) => {
	try {
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;
		const r2 = c.env.financeiro_comprovantes;

		if (!r2) {
			return c.json({ error: 'Bucket R2 não configurado no backend' }, 500);
		}

		const card = await db
			.prepare('SELECT id, workspace_id, card_image_url FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const workspaceId = card.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem alterar a imagem do cartão' }, 403);
		}

		const body = await c.req.parseBody();
		const file = body['cardImage'] || body['file'] || body['image'];

		if (!file || !(file instanceof File)) {
			return c.json({ error: 'Nenhuma imagem enviada.' }, 400);
		}

		if (!file.type.startsWith('image/')) {
			return c.json({ error: 'Arquivo deve ser uma imagem.' }, 400);
		}

		const MAX_SIZE = 5 * 1024 * 1024; // 5MB
		if (file.size > MAX_SIZE) {
			return c.json({ error: 'O tamanho da imagem excede o limite máximo permitido de 5MB' }, 400);
		}

		// Se já existia uma imagem anterior, deletar do R2
		if (card.card_image_url) {
			try {
				await r2.delete(card.card_image_url);
			} catch (deleteErr) {
				console.warn('Não foi possível remover imagem anterior do R2:', deleteErr);
			}
		}

		const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const key = `workspaces/${workspaceId}/cards/${cardId}/${Date.now()}-${sanitizedFileName}`;

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

		await db
			.prepare('UPDATE credit_cards SET card_image_url = ? WHERE id = ? AND workspace_id = ?')
			.bind(key, cardId, workspaceId)
			.run();

		return c.json({
			success: true,
			card_image_url: key,
			cardImageUrl: key,
			imageUrl: `/cards/${cardId}/image`,
		}, 200);
	} catch (err: any) {
		console.error('Erro ao fazer upload da imagem do cartão:', err);
		return c.json({ error: 'Erro ao fazer upload da imagem', details: err?.message }, 500);
	}
};

creditCardsRouter.post('/workspaces/:workspaceId/credit-cards/:id/image', uploadCardImageHandler);
creditCardsRouter.post('/cards/:id/image', uploadCardImageHandler);

// GET /workspaces/:workspaceId/credit-cards/:id/image & /cards/:id/image - Download / Visualização de foto do cartão
const getCardImageHandler = async (c: any) => {
	try {
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;
		const r2 = c.env.financeiro_comprovantes;

		if (!r2) {
			return c.json({ error: 'Bucket R2 não configurado' }, 500);
		}

		const card = await db
			.prepare('SELECT id, workspace_id, card_image_url FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<any>();

		if (!card || !card.card_image_url) {
			return c.json({ error: 'Imagem não encontrada para este cartão' }, 404);
		}

		const workspaceId = card.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		const object = await r2.get(card.card_image_url);
		if (!object) {
			return c.json({ error: 'Arquivo de imagem não encontrado no armazenamento' }, 404);
		}

		const contentType = object.httpMetadata?.contentType || 'image/jpeg';

		return new Response(object.body, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': 'inline',
				'Cache-Control': 'public, max-age=86400',
			},
		});
	} catch (err: any) {
		console.error('Erro ao obter imagem do cartão:', err);
		return c.json({ error: 'Erro ao carregar imagem' }, 500);
	}
};

creditCardsRouter.get('/workspaces/:workspaceId/credit-cards/:id/image', getCardImageHandler);
creditCardsRouter.get('/cards/:id/image', getCardImageHandler);

// DELETE /workspaces/:workspaceId/credit-cards/:id/image & /cards/:id/image - Remoção de foto do cartão
const deleteCardImageHandler = async (c: any) => {
	try {
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;
		const r2 = c.env.financeiro_comprovantes;

		const card = await db
			.prepare('SELECT id, workspace_id, card_image_url FROM credit_cards WHERE id = ?')
			.bind(cardId)
			.first<any>();

		if (!card) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		const workspaceId = card.workspace_id;
		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros viewer não podem remover a imagem do cartão' }, 403);
		}

		if (card.card_image_url && r2) {
			try {
				await r2.delete(card.card_image_url);
			} catch (deleteErr) {
				console.warn('Não foi possível remover imagem do R2:', deleteErr);
			}
		}

		await db
			.prepare('UPDATE credit_cards SET card_image_url = NULL WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.run();

		return c.json({ message: 'Imagem do cartão removida com sucesso' }, 200);
	} catch (err: any) {
		console.error('Erro ao remover imagem do cartão:', err);
		return c.json({ error: 'Erro ao remover imagem do cartão', details: err?.message }, 500);
	}
};

creditCardsRouter.delete('/workspaces/:workspaceId/credit-cards/:id/image', deleteCardImageHandler);
creditCardsRouter.delete('/cards/:id/image', deleteCardImageHandler);

// 5. DELETE /workspaces/:workspaceId/credit-cards/:id - Deletar cartão
creditCardsRouter.delete('/workspaces/:workspaceId/credit-cards/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const cardId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		if (role === 'viewer') {
			return c.json({ error: 'Permissão insuficiente. Membros do tipo viewer não podem deletar cartões' }, 403);
		}

		const existingCard = await db
			.prepare('SELECT id FROM credit_cards WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.first();

		if (!existingCard) {
			return c.json({ error: 'Cartão de crédito não encontrado' }, 404);
		}

		// Verificar se há transações vinculadas a esse cartão
		const usage = await db
			.prepare('SELECT COUNT(*) as count FROM transactions WHERE credit_card_id = ?')
			.bind(cardId)
			.first<{ count: number }>();

		if (usage && usage.count > 0) {
			return c.json({ error: 'Cartão possui transações vinculadas, não pode ser removido' }, 400);
		}

		await db
			.prepare('DELETE FROM credit_cards WHERE id = ? AND workspace_id = ?')
			.bind(cardId, workspaceId)
			.run();

		return c.json({ message: 'Cartão de crédito removido com sucesso' }, 200);
	} catch (err) {
		console.error('Erro ao deletar cartão de crédito:', err);
		return c.json({ error: 'Erro ao deletar cartão de crédito' }, 500);
	}
});

export default creditCardsRouter;

