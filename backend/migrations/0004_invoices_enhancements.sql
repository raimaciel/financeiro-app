-- Adiciona colunas extras na tabela invoices
ALTER TABLE invoices ADD COLUMN paid_at DATETIME;
ALTER TABLE invoices ADD COLUMN workspace_id TEXT;
ALTER TABLE invoices ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
