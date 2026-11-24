CREATE TABLE IF NOT EXISTS local_users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_sessions (
  digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES local_users(id), expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS local_session_expiry ON local_sessions(expires_at);
CREATE TABLE IF NOT EXISTS local_auth_attempts (
  subject TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
