-- Migration 0011: Criação da tabela de contas bancárias (bank_accounts)
CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    bank_name TEXT,
    account_type TEXT NOT NULL CHECK(account_type IN ('checking', 'savings', 'investment', 'cash')) DEFAULT 'checking',
    initial_balance REAL NOT NULL DEFAULT 0,
    color TEXT DEFAULT '#2563eb',
    status TEXT NOT NULL CHECK(status IN ('active', 'archived')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_workspace ON bank_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_status ON bank_accounts(status);
