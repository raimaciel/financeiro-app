-- Migration 0016: Tabela de notificações persistidas
CREATE TABLE IF NOT EXISTS notifications (
  id                   TEXT    PRIMARY KEY,
  workspace_id         TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id              TEXT    NOT NULL,
  type                 TEXT    NOT NULL,
  title                TEXT    NOT NULL,
  message              TEXT    NOT NULL,
  related_entity_type  TEXT,
  related_entity_id    TEXT,
  is_read              INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_user_read
  ON notifications(workspace_id, user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications(created_at);
