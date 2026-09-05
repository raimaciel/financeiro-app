-- Migração 0014: Vínculo de conta bancária ao pagamento da fatura de cartão
ALTER TABLE invoices ADD COLUMN payment_account_id TEXT REFERENCES bank_accounts(id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_account ON invoices(payment_account_id);
