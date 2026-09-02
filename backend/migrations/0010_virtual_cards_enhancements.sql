-- Adiciona suporte a rastreabilidade e expiração de cartões virtuais
ALTER TABLE credit_cards ADD COLUMN registered_for VARCHAR(150);
ALTER TABLE credit_cards ADD COLUMN expires_at DATETIME;
