import type { AIEnvironment } from '../../../src/server/ai-provider';
import { env } from 'cloudflare:workers';
import { InventoryRepository } from '../../../src/server/repository';
import { createInventoryHandlers } from '../../../src/server/handlers';
function handlers() {
  const db = (env as unknown as { DB: D1Database }).DB;
  return createInventoryHandlers(
    new InventoryRepository(
      db,
      (env as unknown as AIEnvironment).AI_PROVIDER === 'remote'
        ? 'remote'
        : 'mock',
    ),
  );
}
export async function GET(request: Request) {
  return handlers().GET(request);
}
export async function POST(request: Request) {
  return handlers().POST(request);
}
