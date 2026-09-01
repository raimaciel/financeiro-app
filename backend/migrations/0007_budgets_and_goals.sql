-- Migration 0007: Criação das tabelas de orçamentos por categoria e metas de economia
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    monthly_limit REAL NOT NULL,
    month_reference TEXT, -- formato "YYYY-MM" ou NULL para orçamento recorrente padrão
    alert_threshold_percent INTEGER NOT NULL DEFAULT 80,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budgets_workspace ON budgets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);

CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL NOT NULL DEFAULT 0,
    target_date TEXT, -- YYYY-MM-DD
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goals_workspace ON savings_goals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON savings_goals(status);
