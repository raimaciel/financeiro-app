-- Migration 0012: Adicionar coluna account_id na tabela transactions
ALTER TABLE transactions ADD COLUMN account_id TEXT REFERENCES bank_accounts(id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
