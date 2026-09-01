-- Migration 0006: Controle de Acesso e Status de Usuários
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
