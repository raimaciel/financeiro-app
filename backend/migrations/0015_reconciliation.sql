-- Migration 0015: Adicionar colunas para conciliação bancária na tabela transactions
ALTER TABLE transactions ADD COLUMN reconciled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN external_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reconciled ON transactions(reconciled);
