-- Adiciona campos de anexo/comprovante na tabela transactions
ALTER TABLE transactions ADD COLUMN attachment_name TEXT;
ALTER TABLE transactions ADD COLUMN attachment_type TEXT;
ALTER TABLE transactions ADD COLUMN attachment_size INTEGER;
