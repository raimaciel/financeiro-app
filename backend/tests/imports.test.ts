import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createEnvMock } from './helpers/mocks';
import { generateToken } from '../src/auth';

const JWT_SECRET = 'test-secret-key-for-unit-tests-1234567890';
const WORKSPACE_ID = 'ws-test-123';
const ACCOUNT_ID = 'acc-test-456';
const FOREIGN_ACCOUNT_ID = 'acc-foreign-789';

async function token(userId = 1, role = 'owner') {
	return generateToken({ userId, email: 'imports@test.com' }, JWT_SECRET);
}

const memberRow = {
	user_id: 1,
	workspace_id: WORKSPACE_ID,
	role: 'owner',
};

const viewerMemberRow = {
	user_id: 2,
	workspace_id: WORKSPACE_ID,
	role: 'viewer',
};

const accountRow = {
	id: ACCOUNT_ID,
	workspace_id: WORKSPACE_ID,
	name: 'Conta Corrente Itaú',
	bank_name: 'Itaú',
	account_type: 'checking',
	initial_balance: 1000,
	status: 'active',
};

const foreignAccountRow = {
	id: FOREIGN_ACCOUNT_ID,
	workspace_id: 'ws-outro-999',
	name: 'Conta de Outro Workspace',
	bank_name: 'Bradesco',
	account_type: 'checking',
	status: 'active',
};

const sampleOfx = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260901120000
<TRNAMT>2500.50
<FITID>OFX123456
<MEMO>PIX RECEBIDO CLIENTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260902120000
<TRNAMT>-120.00
<FITID>OFX123457
<MEMO>PAGAMENTO SUPERMERCADO
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const sampleCsv = `data,valor,descricao
2026-09-05,500.00,TED Recebida
2026-09-06,-85.40,Posto de Gasolina
`;

describe('POST /workspaces/:workspaceId/accounts/:accountId/import (Preview)', () => {
	it('deve retornar 401 sem autenticação', async () => {
		const env = createEnvMock();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/import`, {
			method: 'POST',
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(401);
	});

	it('deve retornar 403 se usuário for viewer', async () => {
		const env = createEnvMock({
			workspace_members: [viewerMemberRow],
			bank_accounts: [accountRow],
		});
		const tk = await token(2, 'viewer');
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/import`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fileContent: sampleCsv, filename: 'extrato.csv' }),
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(403);
	});

	it('deve retornar 404 se a conta pertencer a outro workspace ou não existir', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [foreignAccountRow],
		});
		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${FOREIGN_ACCOUNT_ID}/import`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fileContent: sampleCsv, filename: 'extrato.csv' }),
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(404);
		const data = await res.json() as any;
		expect(data.error).toContain('não encontrada');
	});

	it('deve fazer o parsing correto de um arquivo OFX com detecção automática', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [accountRow],
			categories: [{ id: 1, name: 'Alimentação', type: 'expense' }],
			transactions: [],
		});
		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/import`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fileContent: sampleOfx, filename: 'extrato_setembro.ofx' }),
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data.account_id).toBe(ACCOUNT_ID);
		expect(data.fileType).toBe('ofx');
		expect(data.totalCount).toBe(2);

		const creditTx = data.transactions.find((t: any) => t.type === 'income');
		expect(creditTx).toBeDefined();
		expect(creditTx.amount).toBe(2500.50);
		expect(creditTx.date).toBe('2026-09-01');
		expect(creditTx.description).toContain('PIX RECEBIDO');

		const debitTx = data.transactions.find((t: any) => t.type === 'expense');
		expect(debitTx).toBeDefined();
		expect(debitTx.amount).toBe(120.00);
		expect(debitTx.date).toBe('2026-09-02');
		expect(debitTx.description).toContain('SUPERMERCADO');
	});

	it('deve fazer o parsing correto de um arquivo CSV simples e sugerir categorias', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [accountRow],
			categories: [{ id: 10, name: 'Transporte', type: 'expense' }],
			transactions: [],
		});
		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/import`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fileContent: sampleCsv, filename: 'extrato.csv' }),
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data.fileType).toBe('csv');
		expect(data.totalCount).toBe(2);

		const inc = data.transactions.find((t: any) => t.type === 'income');
		expect(inc).toBeDefined();
		expect(inc.amount).toBe(500.00);
		expect(inc.date).toBe('2026-09-05');
		expect(inc.description).toBe('TED Recebida');

		const exp = data.transactions.find((t: any) => t.type === 'expense');
		expect(exp).toBeDefined();
		expect(exp.amount).toBe(85.40);
		expect(exp.date).toBe('2026-09-06');
		expect(exp.description).toBe('Posto de Gasolina');
	});

	it('deve marcar possíveis duplicatas se a transação já existir na conta', async () => {
		const existingTx = {
			id: 101,
			workspace_id: WORKSPACE_ID,
			account_id: ACCOUNT_ID,
			date: '2026-09-05',
			amount: 500.00,
			description: 'TED Recebida',
			type: 'income',
		};

		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [accountRow],
			categories: [],
			transactions: [existingTx],
		});

		const tk = await token();
		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/import`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fileContent: sampleCsv, filename: 'extrato.csv' }),
		});
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data.duplicatesCount).toBe(1);
		const dup = data.transactions.find((t: any) => t.description === 'TED Recebida');
		expect(dup.is_duplicate).toBe(true);
	});
});

describe('POST /workspaces/:workspaceId/accounts/:accountId/import/confirm (Confirmar)', () => {
	it('deve inserir transações válidas vinculadas à conta bancária', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [accountRow],
			transactions: [],
		});
		const tk = await token();

		const payload = {
			transactions: [
				{
					date: '2026-09-01',
					amount: 2500.50,
					description: 'PIX Recebido',
					type: 'income',
					category_id: null,
				},
				{
					date: '2026-09-02',
					amount: 120.00,
					description: 'Supermercado',
					type: 'expense',
					category_id: 5,
				},
			],
		};

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/import/confirm`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data.success).toBe(true);
		expect(data.imported_count).toBe(2);
		expect(data.duplicates_ignored).toBe(0);
	});

	it('deve ignorar transações duplicadas na confirmação', async () => {
		const existingTx = {
			id: 1,
			workspace_id: WORKSPACE_ID,
			account_id: ACCOUNT_ID,
			date: '2026-09-01',
			amount: 2500.50,
			description: 'PIX Recebido',
			type: 'income',
		};

		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [accountRow],
			transactions: [existingTx],
		});
		const tk = await token();

		const payload = {
			transactions: [
				{
					date: '2026-09-01',
					amount: 2500.50,
					description: 'PIX Recebido',
					type: 'income',
				},
				{
					date: '2026-09-03',
					amount: 45.00,
					description: 'Farmácia',
					type: 'expense',
				},
			],
		};

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${ACCOUNT_ID}/import/confirm`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const data = await res.json() as any;

		expect(data.success).toBe(true);
		expect(data.imported_count).toBe(1);
		expect(data.duplicates_ignored).toBe(1);
	});

	it('deve rejeitar confirmação se a conta pertencer a outro workspace', async () => {
		const env = createEnvMock({
			workspace_members: [memberRow],
			bank_accounts: [foreignAccountRow],
			transactions: [],
		});
		const tk = await token();

		const req = new Request(`http://localhost/workspaces/${WORKSPACE_ID}/accounts/${FOREIGN_ACCOUNT_ID}/import/confirm`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tk}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ transactions: [{ date: '2026-09-01', amount: 10, description: 'Teste' }] }),
		});

		const res = await app.fetch(req, env);
		expect(res.status).toBe(404);
	});
});
