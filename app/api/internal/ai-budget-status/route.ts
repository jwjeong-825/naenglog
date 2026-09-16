import { env } from 'cloudflare:workers';
import { AIBudget } from '../../../../src/server/ai-budget';
import { requireUser, sha256 } from '../../../../src/server/auth-session';
import type { AIEnvironment } from '../../../../src/server/ai-provider';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request) {
  const bindings = env as unknown as AIEnvironment & { DB: D1Database };
  const user = await requireUser(request, bindings.DB);
  if (!user)
    return Response.json(
      {
        halted: false,
        estimatedKrw: 0,
        remainingKrw: 27000,
        level: 'normal',
        requests: 0,
        byFeature: { analyze: 0, interpret: 0, briefing: 0 },
        inputTokens: 0,
        outputTokens: 0,
        analyzeSessionUsed: 0,
        analyzeSessionLimit: 20,
        briefingSessionUsed: 0,
        briefingSessionLimit: 5,
        interpretSessionUsed: 0,
        interpretSessionLimit: 15,
        blockedReason: 'unknown',
      },
      { status: 401, headers },
    );

  const budget = new AIBudget(bindings.DB, bindings);
  return Response.json(
    await budget.diagnosticStatus(await sha256(user.id)),
    { headers },
  );
}
