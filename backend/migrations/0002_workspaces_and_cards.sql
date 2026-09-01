-- Workspaces (conta pessoal/casal/empresa)
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('personal','couple','business')) DEFAULT 'personal',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Relação usuário <-> workspace com permissão
CREATE TABLE workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT CHECK(role IN ('owner','editor','viewer')) DEFAULT 'editor',
  invited_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cartões de crédito
CREATE TABLE credit_cards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  brand TEXT,
  limit_amount REAL,
  closing_day INTEGER NOT NULL,
  due_day INTEGER NOT NULL,
  best_purchase_day INTEGER,
  color TEXT DEFAULT '#000000',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Faturas
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  credit_card_id TEXT NOT NULL REFERENCES credit_cards(id),
  reference_month TEXT NOT NULL,
  closing_date DATE NOT NULL,
  due_date DATE NOT NULL,
  total_amount REAL DEFAULT 0,
  status TEXT CHECK(status IN ('open','closed','paid')) DEFAULT 'open'
);

-- Ajustar categories: adicionar workspace_id, icon e color
ALTER TABLE categories ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE categories ADD COLUMN icon TEXT DEFAULT 'circle';
ALTER TABLE categories ADD COLUMN color TEXT DEFAULT '#999999';

-- Ajustar transactions: adicionar workspace_id, credit_card_id, installments
ALTER TABLE transactions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE transactions ADD COLUMN credit_card_id TEXT REFERENCES credit_cards(id);
ALTER TABLE transactions ADD COLUMN installments INTEGER DEFAULT 1;
ALTER TABLE transactions ADD COLUMN installment_current INTEGER DEFAULT 1;
