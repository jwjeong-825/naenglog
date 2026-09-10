import { env } from 'cloudflare:workers';
import { budgetStatus } from '../../../../src/server/ai-budget-admin';
import type { BudgetEnvironment } from '../../../../src/server/ai-budget';
export async function GET(request: Request) {
  const bindings = env as unknown as BudgetEnvironment & { DB: D1Database };
  return budgetStatus(request, bindings.DB, bindings);
}
