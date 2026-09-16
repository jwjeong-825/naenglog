ALTER TABLE sessions ADD COLUMN persistent INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE sessions SET persistent=1 WHERE julianday(expires_at)-julianday(created_at)>2;
--> statement-breakpoint
CREATE TABLE member_inventories (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
 snapshot TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO member_inventories(user_id,snapshot,revision,created_at,updated_at)
SELECT user_id,json_set(snapshot,'$.user.id',user_id,'$.user.mode','member'),revision,created_at,updated_at
FROM user_inventories WHERE json_valid(snapshot) AND user_id IN (SELECT id FROM users);
--> statement-breakpoint
CREATE TABLE auth_attempts (
 bucket TEXT PRIMARY KEY NOT NULL,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_attempts_expiry ON auth_attempts(expires_at);
