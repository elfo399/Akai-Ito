ALTER TABLE users ADD COLUMN lock_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN lock_timeout INTEGER NOT NULL DEFAULT 300 CHECK(lock_timeout IN (0,60,300,900));
ALTER TABLE session ADD COLUMN last_activity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN background_at INTEGER;
ALTER TABLE session ADD COLUMN locked_at INTEGER;
ALTER TABLE session ADD COLUMN verified_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX passkeys_user ON passkeys(user_id);
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('registration','unlock')),
  challenge TEXT NOT NULL,
  expires INTEGER NOT NULL,
  UNIQUE(session_id,purpose)
);
CREATE TABLE session_presence (
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  tab_id TEXT NOT NULL,
  visible INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY(session_id,tab_id)
);
