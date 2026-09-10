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
