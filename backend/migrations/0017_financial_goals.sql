-- Migration 0017: Metas Financeiras e aprimoramento de Orçamentos por Categoria
CREATE TABLE IF NOT EXISTS financial_goals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL NOT NULL DEFAULT 0,
    deadline TEXT, -- YYYY-MM-DD
    account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
    color TEXT DEFAULT '#10b981',
    icon TEXT DEFAULT 'Target',
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'archived')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_financial_goals_workspace ON financial_goals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financial_goals_status ON financial_goals(status);

-- Suporte a colunas month e limit_amount na tabela budgets
ALTER TABLE budgets ADD COLUMN month TEXT;
ALTER TABLE budgets ADD COLUMN limit_amount REAL;

CREATE INDEX IF NOT EXISTS idx_budgets_workspace_month ON budgets(workspace_id, month);
