import { env } from 'cloudflare:workers';
import { AIBudget } from '../../../../src/server/ai-budget';
import { readToken, sessionHash } from '../../../../src/server/handlers';
import type { AIEnvironment } from '../../../../src/server/ai-provider';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request) {
  const token = readToken(request);
  if (!token)
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

  const bindings = env as unknown as AIEnvironment & { DB: D1Database };
  const budget = new AIBudget(bindings.DB, bindings);
  return Response.json(
    await budget.diagnosticStatus(await sessionHash(token)),
    { headers },
  );
}
