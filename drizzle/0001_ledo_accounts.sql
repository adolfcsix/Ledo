CREATE TABLE ledo_organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE ledo_members (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL REFERENCES ledo_organizations(id),
  user_id TEXT,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  roles TEXT NOT NULL,
  branch TEXT NOT NULL,
  approval_limit INTEGER,
  bank_link INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','active','suspended')),
  invite_hash TEXT UNIQUE,
  invite_until INTEGER,
  valid_until INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  UNIQUE(org_id,email),
  UNIQUE(org_id,user_id)
);
--> statement-breakpoint
CREATE INDEX ledo_members_user ON ledo_members(user_id,org_id);
--> statement-breakpoint
CREATE TABLE ledo_access_log (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL REFERENCES ledo_organizations(id),
  member_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX ledo_access_log_org ON ledo_access_log(org_id,created_at);
