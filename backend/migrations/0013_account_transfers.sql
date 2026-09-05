-- Migração 0013: Transferências entre contas bancárias (account_transfers)
CREATE TABLE IF NOT EXISTS account_transfers (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    from_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
    to_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
    amount REAL NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfers_workspace ON account_transfers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from_account ON account_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_account ON account_transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_date ON account_transfers(date);
