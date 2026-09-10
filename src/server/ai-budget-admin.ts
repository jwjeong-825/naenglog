import { AIBudget, fingerprint, type BudgetEnvironment } from './ai-budget';
import type { Database } from './repository';
export async function budgetStatus(
  request: Request,
  db: Database,
  env: BudgetEnvironment,
) {
  const secret = env.AI_BUDGET_ADMIN_TOKEN;
  const supplied = request.headers
    .get('Authorization')
    ?.replace(/^Bearer /, '');
  if (
    !secret ||
    secret.length < 32 ||
    !supplied ||
    supplied.length > 1024 ||
    (await fingerprint(secret)) !== (await fingerprint(supplied))
  )
    return new Response(null, { status: 404 });
  const budget = new AIBudget(db, env);
  return Response.json(
    { paid: await budget.summary(), mock: await budget.summary(false) },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
