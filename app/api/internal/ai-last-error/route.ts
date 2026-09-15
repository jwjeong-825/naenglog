import { env } from 'cloudflare:workers';

export async function GET() {
  const bindings = env as unknown as { DB: D1Database };
  const row = await bindings.DB.prepare(
    'SELECT snapshot, revision FROM ai_budget WHERE id=?',
  )
    .bind('championship-2026')
    .first<{ snapshot: string; revision: number }>();

  if (!row) {
    return Response.json(
      { found: false },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  let ledger: any;
  try {
    ledger = JSON.parse(row.snapshot);
  } catch {
    return Response.json(
      { found: false, ledgerReadable: false },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];

  // We are debugging receipt/image analysis specifically. Background briefing failures
  // can be newer and would otherwise hide the relevant analyze diagnostic.
  const latest = [...entries]
    .reverse()
    .find(
      (entry: any) =>
        entry?.feature === 'analyze' &&
        entry?.image === true &&
        (entry?.status === 'uncertain' || entry?.diagnostic),
    );

  if (!latest) {
    return Response.json(
      {
        found: false,
        halted: ledger?.halted === true,
        revision: row.revision,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  const d = latest.diagnostic ?? {};
  const inferredReasonCode =
    typeof d.reasonCode === 'string'
      ? d.reasonCode
      : d.stage === 'domain' && d.failure === 'invalid_response'
        ? 'post_validation_rule_failed'
        : null;

  return Response.json(
    {
      found: true,
      halted: ledger?.halted === true,
      revision: row.revision,
      feature: latest.feature ?? null,
      image: latest.image === true,
      status: latest.status ?? null,
      failure: typeof d.failure === 'string' ? d.failure : null,
      reasonCode: inferredReasonCode,
      reasonCodeInferred:
        typeof d.reasonCode !== 'string' && inferredReasonCode !== null,
      stage: typeof d.stage === 'string' ? d.stage : null,
      httpStatus: Number.isInteger(d.httpStatus) ? d.httpStatus : null,
      errorCode: typeof d.errorCode === 'string' ? d.errorCode : null,
      errorType: typeof d.errorType === 'string' ? d.errorType : null,
      parameter: typeof d.parameter === 'string' ? d.parameter : null,
      timeout: d.timeout === true,
      networkError: d.networkError === true,
      networkCategory:
        typeof d.networkCategory === 'string' ? d.networkCategory : null,
      dispatched: d.dispatched === true,
      usageKnown:
        !!latest.usage &&
        Number.isInteger(latest.usage.inputTokens) &&
        Number.isInteger(latest.usage.outputTokens),
      inputTokens: Number.isInteger(latest.usage?.inputTokens)
        ? latest.usage.inputTokens
        : null,
      outputTokens: Number.isInteger(latest.usage?.outputTokens)
        ? latest.usage.outputTokens
        : null,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
