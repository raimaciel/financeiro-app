-- Migration 0009: Adicionar coluna de foto/imagem do cartão de crédito
ALTER TABLE credit_cards ADD COLUMN card_image_url TEXT;
