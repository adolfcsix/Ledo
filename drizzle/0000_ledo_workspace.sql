CREATE TABLE ledo_workspaces (
  owner_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE ledo_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES ledo_workspaces(owner_id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX ledo_sessions_owner ON ledo_sessions (owner_id, updated_at);
