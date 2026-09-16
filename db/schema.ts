import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const aiBudget = sqliteTable('ai_budget', {
  id: text('id').primaryKey(),
  snapshot: text('snapshot').notNull(),
  revision: integer('revision').notNull().default(0),
});
export const aiCache = sqliteTable('ai_cache', {
  cacheKey: text('cache_key').primaryKey(),
  payload: text('payload').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
// The inventory aggregate keeps item balances and the immutable ledger in one atomic write.
export const inventories = sqliteTable('inventories', {
  sessionHash: text('session_hash').primaryKey(),
  snapshot: text('snapshot').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_users_email').on(table.email),
    uniqueIndex('idx_users_phone').on(table.phone),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    persistent: integer('persistent').notNull().default(0),
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ],
);

export const userInventories = sqliteTable('user_inventories', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  snapshot: text('snapshot').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const loginAttempts = sqliteTable('login_attempts', {
  keyHash: text('key_hash').primaryKey(),
  failures: integer('failures').notNull().default(0),
  blockedUntil: text('blocked_until'),
  updatedAt: text('updated_at').notNull(),
});

export const memberInventories = sqliteTable('member_inventories', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  snapshot: text('snapshot').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const authAttempts = sqliteTable(
  'auth_attempts',
  {
    bucket: text('bucket').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('auth_attempts_expiry').on(table.expiresAt)],
);
