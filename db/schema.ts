import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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

// Legacy inventories remain quarantined. Member aggregate ownership is enforced by FK.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  persistent: integer('persistent').notNull(),
  createdAt: text('created_at').notNull(),
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
export const authAttempts = sqliteTable('auth_attempts', {
  bucket: text('bucket').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
