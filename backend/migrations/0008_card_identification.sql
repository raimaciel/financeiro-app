-- Migration 0008: Adicionar campos de identificação aos cartões de crédito
ALTER TABLE credit_cards ADD COLUMN card_type TEXT DEFAULT 'physical';
ALTER TABLE credit_cards ADD COLUMN last_four_digits TEXT;
ALTER TABLE credit_cards ADD COLUMN bank_name TEXT;
ALTER TABLE credit_cards ADD COLUMN institution TEXT;
ALTER TABLE credit_cards ADD COLUMN card_tier TEXT DEFAULT 'standard';
