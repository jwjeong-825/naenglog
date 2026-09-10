import { env } from 'cloudflare:workers';
import { createAIHandler } from '../../../src/server/ai-handlers';
import { InventoryRepository } from '../../../src/server/repository';
import type { AIEnvironment } from '../../../src/server/ai-provider';
export async function POST(request: Request) {
  const bindings = env as unknown as AIEnvironment & { DB: D1Database };
  return createAIHandler(
    new InventoryRepository(bindings.DB),
    bindings,
    bindings.DB,
  )(request);
}
