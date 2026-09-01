-- Migration 0006: Criação da tabela de transações recorrentes
CREATE TABLE IF NOT EXISTS recurring_transactions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    category_id INTEGER,
    credit_card_id TEXT,
    frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'weekly', 'yearly')) DEFAULT 'monthly',
    day_of_month INTEGER,
    day_of_week INTEGER,
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'cancelled')) DEFAULT 'active',
    last_generated_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (credit_card_id) REFERENCES credit_cards(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_workspace ON recurring_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_recurring_status ON recurring_transactions(status);
