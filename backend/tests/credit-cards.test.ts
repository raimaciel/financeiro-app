import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

describe('Credit Cards Router & Card Identification', () => {
	const USER_ID = 10;
	const USER_EMAIL = 'user@example.com';
	const VIEWER_ID = 20;
	const NON_MEMBER_ID = 99;
	const WORKSPACE_ID = 'ws-test-123';
	const CARD_ID = 'card-uuid-1';

	let token: string;
	let viewerToken: string;
	let nonMemberToken: string;

	const memberRow = {
		id: 'wm-1',
		workspace_id: WORKSPACE_ID,
		user_id: String(USER_ID),
		role: 'owner',
	};

	const viewerMemberRow = {
		id: 'wm-2',
		workspace_id: WORKSPACE_ID,
		user_id: String(VIEWER_ID),
		role: 'viewer',
	};

	const existingCardRow = {
		id: CARD_ID,
		workspace_id: WORKSPACE_ID,
		name: 'Nubank Ultravioleta',
		brand: 'mastercard',
		limit_amount: 15000,
		closing_day: 10,
		due_day: 17,
		best_purchase_day: 11,
		color: '#820AD1',
		card_type: 'physical',
		last_four_digits: '1234',
		bank_name: 'Nubank',
		institution: 'Nu Pagamentos S.A.',
		card_tier: 'black',
		created_at: '2026-09-01T12:00:00Z',
	};

	beforeEach(async () => {
		token = await generateToken({ userId: USER_ID, email: USER_EMAIL }, 'test-secret-key-for-unit-tests-1234567890');
		viewerToken = await generateToken({ userId: VIEWER_ID, email: 'viewer@example.com' }, 'test-secret-key-for-unit-tests-1234567890');
		nonMemberToken = await generateToken({ userId: NON_MEMBER_ID, email: 'stranger@example.com' }, 'test-secret-key-for-unit-tests-1234567890');
	});

	it('POST /workspaces/:id/credit-cards - deve criar cartão com todos os campos de identificação', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
		});

		const payload = {
			name: 'Inter Black Virtual',
			cardType: 'virtual',
			lastFourDigits: '9876',
			bankName: 'Banco Inter',
			institution: 'Banco Inter S.A.',
			cardTier: 'black',
			brand: 'mastercard',
			limit: 25000,
			closingDay: 5,
			dueDay: 12,
			color: '#FF7A00',
		};

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);

		const data: any = await res.json();
		expect(data.name).toBe('Inter Black Virtual');
		expect(data.card_type).toBe('virtual');
		expect(data.cardType).toBe('virtual');
		expect(data.last_four_digits).toBe('9876');
		expect(data.lastFourDigits).toBe('9876');
		expect(data.bank_name).toBe('Banco Inter');
		expect(data.bankName).toBe('Banco Inter');
		expect(data.institution).toBe('Banco Inter S.A.');
		expect(data.card_tier).toBe('black');
		expect(data.cardTier).toBe('black');
		expect(data.brand).toBe('mastercard');
		expect(data.limit_amount).toBe(25000);
		expect(data.color).toBe('#FF7A00');
		expect(data.next_closing_date).toBeDefined();
		expect(data.next_due_date).toBeDefined();
	});

	it('POST /workspaces/:id/credit-cards - deve aplicar valores default para card_type e card_tier quando omitidos', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
		});

		const payload = {
			name: 'Cartão Básico',
			closing_day: 15,
			due_day: 22,
		};

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(201);

		const data: any = await res.json();
		expect(data.card_type).toBe('physical');
		expect(data.cardType).toBe('physical');
		expect(data.card_tier).toBe('standard');
		expect(data.cardTier).toBe('standard');
		expect(data.last_four_digits).toBeNull();
		expect(data.bank_name).toBeNull();
	});

	it('POST /workspaces/:id/credit-cards - deve rejeitar card_type inválido com erro 400', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
		});

		const payload = {
			name: 'Cartão Inválido',
			cardType: 'titanium',
			closing_day: 10,
			due_day: 20,
		};

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);

		const data: any = await res.json();
		expect(data.error).toContain('card_type inválido');
	});

	it('POST /workspaces/:id/credit-cards - deve rejeitar last_four_digits inválido (não numérico ou tamanho != 4)', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [],
		});

		const invalidCases = ['123', '12345', '12a4', '4004000000001234', 'abcd'];

		for (const digits of invalidCases) {
			const payload = {
				name: 'Cartão Teste',
				lastFourDigits: digits,
				closing_day: 10,
				due_day: 20,
			};

			const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(payload),
			});

			const res = await app.fetch(req, env);
			expect(res.status).toBe(400);
			const data: any = await res.json();
			expect(data.error).toContain('last_four_digits deve conter exatamente 4 números');
		}
	});

	it('GET /workspaces/:id/credit-cards - deve listar cartões com dados de identificação', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [existingCardRow],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(1);
		expect(data[0].id).toBe(CARD_ID);
		expect(data[0].card_type).toBe('physical');
		expect(data[0].last_four_digits).toBe('1234');
		expect(data[0].bank_name).toBe('Nubank');
		expect(data[0].institution).toBe('Nu Pagamentos S.A.');
		expect(data[0].card_tier).toBe('black');
	});

	it('GET /workspaces/:id/credit-cards/:cardId - deve retornar detalhes de um cartão', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [existingCardRow],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards/${CARD_ID}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(data.id).toBe(CARD_ID);
		expect(data.card_type).toBe('physical');
		expect(data.last_four_digits).toBe('1234');
		expect(data.bank_name).toBe('Nubank');
	});

	it('PATCH /cards/:id - deve atualizar campos de identificação diretamente pela rota /cards/:id', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [{ ...existingCardRow }],
		});

		const payload = {
			cardType: 'virtual',
			lastFourDigits: '5555',
			bankName: 'Nubank PJ',
			institution: 'Nu Pagamentos',
			cardTier: 'platinum',
			brand: 'mastercard',
		};

		const req = new Request(`http://localhost/cards/${CARD_ID}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(data.success).toBe(true);
		expect(data.card_type).toBe('virtual');
		expect(data.cardType).toBe('virtual');
		expect(data.last_four_digits).toBe('5555');
		expect(data.lastFourDigits).toBe('5555');
		expect(data.bank_name).toBe('Nubank PJ');
		expect(data.card_tier).toBe('platinum');
	});

	it('PUT /workspaces/:id/credit-cards/:cardId - deve atualizar cartão e validar formato de 4 dígitos', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [{ ...existingCardRow }],
		});

		const invalidReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards/${CARD_ID}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				last_four_digits: '12345',
			}),
		});

		const invalidRes = await app.fetch(invalidReq, env);
		expect(invalidRes.status).toBe(400);

		const validReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards/${CARD_ID}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				card_type: 'virtual',
				last_four_digits: '4321',
				card_tier: 'infinite',
			}),
		});

		const validRes = await app.fetch(validReq, env);
		expect(validRes.status).toBe(200);
		const validData: any = await validRes.json();
		expect(validData.card_type).toBe('virtual');
		expect(validData.last_four_digits).toBe('4321');
		expect(validData.card_tier).toBe('infinite');
	});

	it('Viewer não deve poder criar ou editar cartões (403)', async () => {
		const env = createEnvMock({
			workspace_members: [viewerMemberRow],
			credit_cards: [{ ...existingCardRow }],
		});

		// Tentar criar
		const createReq = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${viewerToken}`,
			},
			body: JSON.stringify({
				name: 'Cartão Viewer',
				closing_day: 10,
				due_day: 20,
			}),
		});

		const createRes = await app.fetch(createReq, env);
		expect(createRes.status).toBe(403);

		// Tentar editar
		const editReq = new Request(`http://localhost/cards/${CARD_ID}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${viewerToken}`,
			},
			body: JSON.stringify({
				name: 'Tentativa de Edição',
			}),
		});

		const editRes = await app.fetch(editReq, env);
		expect(editRes.status).toBe(403);
	});

	it('POST /cards/:id/image - deve fazer upload da imagem do cartão com sucesso', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [{ ...existingCardRow }],
		});

		const formData = new FormData();
		const imageFile = new File(['fake-image-bytes'], 'card-photo.png', { type: 'image/png' });
		formData.append('cardImage', imageFile);

		const req = new Request(`http://localhost/cards/${CARD_ID}/image`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: formData,
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(data.success).toBe(true);
		expect(data.card_image_url).toBeDefined();
		expect(data.imageUrl).toBe(`/cards/${CARD_ID}/image`);
	});

	it('POST /cards/:id/image - deve recusar arquivos que não sejam imagens', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [{ ...existingCardRow }],
		});

		const formData = new FormData();
		const textFile = new File(['hello text'], 'notes.txt', { type: 'text/plain' });
		formData.append('cardImage', textFile);

		const req = new Request(`http://localhost/cards/${CARD_ID}/image`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: formData,
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(400);

		const data: any = await res.json();
		expect(data.error).toContain('Arquivo deve ser uma imagem');
	});

	it('DELETE /cards/:id/image - deve remover imagem do cartão', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [{ ...existingCardRow, card_image_url: 'workspaces/ws-1/cards/c1/test.png' }],
		});

		const req = new Request(`http://localhost/cards/${CARD_ID}/image`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);

		const data: any = await res.json();
		expect(data.message).toContain('removida com sucesso');
	});

	it('Não-membro do workspace deve receber 403', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			credit_cards: [{ ...existingCardRow }],
		});

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/credit-cards`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${nonMemberToken}`,
			},
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});
});

