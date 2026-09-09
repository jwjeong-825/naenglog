import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
// The inventory aggregate keeps item balances and the immutable ledger in one atomic write.
export const inventories = sqliteTable('inventories', {
  sessionHash: text('session_hash').primaryKey(),
  snapshot: text('snapshot').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
