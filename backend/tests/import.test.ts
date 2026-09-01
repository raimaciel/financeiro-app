import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-import-123';
const USER_ID = 1;

async function token() {
	return generateToken({ userId: USER_ID, email: 'import@test.com' }, JWT_SECRET);
}

const memberRow = { role: 'owner' };

const categoryRows = [
	{ id: 1, name: 'Alimentação', type: 'expense', workspace_id: WORKSPACE_ID },
	{ id: 2, name: 'Transporte', type: 'expense', workspace_id: WORKSPACE_ID },
];

const sampleOfx = `<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260815120000
<TRNAMT>-150.50
<FITID>20260815001
<MEMO>Supermercado Extra 02/05
</STMTTRN>
</BANKTRANLIST>
</OFX>`;

const sampleCsv = `Data,Valor,Identificador,Descrição
2026-08-15,-80.00,id-01,Uber *Trip
2026-08-16,3000.00,id-02,Pix Recebido - Salario`;

describe('POST /workspaces/:workspaceId/import/parse', () => {
	it('deve retornar 401 sem token', async () => {
		const env = createEnvMock();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/import/parse`, {
			method: 'POST',
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar 403 se usuário não for membro do workspace', async () => {
		const env = createEnvMock({ workspace_members: [] });
		const tk = await token();
		const form = new FormData();
		form.append('file', new File(['data'], 'extrato.ofx', { type: 'text/plain' }));

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/import/parse`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${tk}` },
			body: form,
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve fazer parse de arquivo OFX e aplicar categorização e parcelamento', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			categories: categoryRows,
			transactions: [],
		});
		const tk = await token();

		const form = new FormData();
		form.append('file', new File([sampleOfx], 'extrato.ofx', { type: 'application/x-ofx' }));

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/import/parse`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${tk}` },
			body: form,
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data.fileType).toBe('ofx');
		expect(data.totalCount).toBe(1);
		expect(data.transactions).toHaveLength(1);

		const tx = data.transactions[0];
		expect(tx.date).toBe('2026-08-15');
		expect(tx.amount).toBe(150.5);
		expect(tx.type).toBe('expense');
		expect(tx.installments).toBe(5);
		expect(tx.installmentCurrent).toBe(2);
		expect(tx.selected).toBe(true);
	});

	it('deve fazer parse de arquivo CSV', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			categories: categoryRows,
			transactions: [],
		});
		const tk = await token();

		const form = new FormData();
		form.append('file', new File([sampleCsv], 'extrato.csv', { type: 'text/csv' }));
		form.append('bank', 'nubank');

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/import/parse`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${tk}` },
			body: form,
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data.fileType).toBe('csv');
		expect(data.totalCount).toBe(2);
		expect(data.transactions[0].description).toBe('Uber *Trip');
		expect(data.transactions[0].categoryId).toBe(2); // Auto-categorizado como Transporte!
		expect(data.transactions[0].type).toBe('expense');
		expect(data.transactions[1].type).toBe('income');
	});
});

describe('POST /workspaces/:workspaceId/import/confirm', () => {
	it('deve retornar 403 para usuário viewer', async () => {
		const env = createEnvMock({ workspace_members: [{ role: 'viewer' }] });
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/import/confirm`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				transactions: [
					{
						date: '2026-08-15',
						description: 'Teste',
						amount: 100,
						type: 'expense',
					},
				],
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve gravar lote de transações com sucesso', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/import/confirm`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${tk}`,
			},
			body: JSON.stringify({
				transactions: [
					{
						date: '2026-08-15',
						description: 'Mercado',
						amount: 150.5,
						type: 'expense',
						categoryId: 1,
						installments: 1,
						installmentCurrent: 1,
					},
					{
						date: '2026-08-16',
						description: 'Salario',
						amount: 3500,
						type: 'income',
						installments: 1,
						installmentCurrent: 1,
					},
				],
			}),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;
		expect(data.success).toBe(true);
		expect(data.count).toBe(2);
	});
});
