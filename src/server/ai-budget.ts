import type { Database } from './repository';
import type { RequestOptions } from '../ai-service';

export type Feature = 'analyze' | 'interpret' | 'briefing';
export type BudgetEnvironment = {
  AI_PRICING_JSON?: string;
  AI_MODEL?: string;
  AI_BUDGET_ADMIN_TOKEN?: string;
  AI_PROJECT_ID?: string;
  AI_HARD_LIMIT_VERIFIED?: string;
};
type Pricing = {
  model: string;
  currency: string;
  inputPerMillion: number;
  outputPerMillion: number;
  imagePerRequest: number;
  krwPerCurrency: number;
  verifiedAt: string;
};
type Usage = { model: string; inputTokens: number; outputTokens: number };
type Entry = {
  id: string;
  key: string;
  session: string;
  feature: Feature;
  model: string;
  image: boolean;
  at: number;
  day: string;
  reserved: number;
  cost: number;
  cumulative: number;
  status: 'pending' | 'completed' | 'uncertain';
  usage: Usage | null;
  pricing: Pricing | null;
};
type Ledger = { total: number; halted: boolean; entries: Entry[] };
export class BudgetError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: 'trial_limit' | 'busy' | 'unavailable' = status === 429
      ? 'trial_limit'
      : 'unavailable',
  ) {
    super(message);
  }
}
const exhausted =
  '대회 체험용 AI 사용 한도에 도달했습니다. 기존 냉장고 기능은 계속 이용할 수 있습니다.';
export const limits = (feature: Feature) => ({
  maxInputTokens: feature === 'analyze' ? 16000 : 6000,
  maxOutputTokens:
    feature === 'analyze' ? 3000 : feature === 'interpret' ? 500 : 700,
  maxImages: 1,
  maxImageBytes: 5 * 1024 * 1024,
  maxRetries: 0,
  maxCalls: 1,
});
export async function fingerprint(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export class AIBudget {
  constructor(
    private db: Database,
    private env: BudgetEnvironment,
    private now = () => Date.now(),
  ) {}
  private pricing(remote: boolean): Pricing | null {
    if (!remote) return null;
    let p: Pricing;
    try {
      p = JSON.parse(this.env.AI_PRICING_JSON ?? '');
    } catch {
      throw new BudgetError(
        503,
        'AI 비용 설정이 준비되지 않았습니다. 기본 냉장고 기능을 이용해주세요.',
      );
    }
    if (
      !p ||
      !p.model ||
      p.model !== this.env.AI_MODEL ||
      !/^[A-Z]{3}$/.test(p.currency) ||
      ![
        p.inputPerMillion,
        p.outputPerMillion,
        p.imagePerRequest,
        p.krwPerCurrency,
      ].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) ||
      p.krwPerCurrency <= 0 ||
      p.inputPerMillion + p.outputPerMillion <= 0 ||
      !Number.isFinite(Date.parse(p.verifiedAt)) ||
      this.now() - Date.parse(p.verifiedAt) > 7 * 86400000 ||
      Date.parse(p.verifiedAt) > this.now() ||
      !this.env.AI_PROJECT_ID ||
      this.env.AI_HARD_LIMIT_VERIFIED !== 'true'
    )
      throw new BudgetError(
        503,
        'AI 가격·환율·전용 프로젝트 한도 확인이 필요합니다. 기본 냉장고 기능을 이용해주세요.',
      );
    return p;
  }
  private cost(
    p: Pricing | null,
    input: number,
    output: number,
    image: boolean,
  ) {
    return p
      ? Math.ceil(
          ((input * p.inputPerMillion + output * p.outputPerMillion) / 1e6 +
            (image ? p.imagePerRequest : 0)) *
            p.krwPerCurrency *
            1.2 *
            1000,
        )
      : 0;
  }
  private async mutate<T>(
    id: string,
    action: (ledger: Ledger) => T,
  ): Promise<T> {
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO ai_budget (id,snapshot,revision) VALUES (?,?,0)',
      )
      .bind(id, JSON.stringify({ total: 0, halted: false, entries: [] }))
      .run();
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.db
        .prepare('SELECT snapshot,revision FROM ai_budget WHERE id=?')
        .bind(id)
        .first<{ snapshot: string; revision: number }>();
      if (!row) throw new Error('Missing budget');
      const ledger: Ledger = JSON.parse(row.snapshot);
      if (
        !ledger ||
        !Number.isSafeInteger(ledger.total) ||
        ledger.total < 0 ||
        typeof ledger.halted !== 'boolean' ||
        !Array.isArray(ledger.entries) ||
        ledger.entries.length > 1000 ||
        ledger.entries.some(
          (e) =>
            !e ||
            !Number.isSafeInteger(e.cost) ||
            e.cost < 0 ||
            !Number.isSafeInteger(e.at) ||
            !['pending', 'completed', 'uncertain'].includes(e.status),
        )
      )
        throw new BudgetError(
          503,
          'AI 사용량 장부를 확인하지 못했습니다. 기본 냉장고 기능을 이용해주세요.',
        );
      const result = action(ledger);
      const changed = await this.db
        .prepare(
          'UPDATE ai_budget SET snapshot=?, revision=revision+1 WHERE id=? AND revision=?',
        )
        .bind(JSON.stringify(ledger), id, row.revision)
        .run();
      if (changed.meta.changes) return result;
    }
    throw new BudgetError(
      429,
      '다른 AI 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.',
      'busy',
    );
  }
  async run<T>(
    session: string,
    feature: Feature,
    remote: boolean,
    image: boolean,
    input: unknown,
    work: (options: Omit<RequestOptions, 'signal'>) => Promise<T>,
  ): Promise<T> {
    const p = this.pricing(remote),
      bounds = limits(feature),
      now = this.now();
    const ledgerId = remote ? 'championship-2026' : 'championship-2026-mock';
    const key = await fingerprint({ session, feature, input, p, version: 2 });
    const cached = await this.db
      .prepare(
        'SELECT payload FROM ai_cache WHERE cache_key=? AND expires_at>?',
      )
      .bind(key, now)
      .first<{ payload: string }>();
    if (cached) return JSON.parse(cached.payload) as T;
    const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    const reserved = this.cost(
      p,
      bounds.maxInputTokens,
      bounds.maxOutputTokens,
      image,
    );
    if (!Number.isSafeInteger(reserved) || reserved > 27000000)
      throw new BudgetError(
        503,
        '요청 비용 설정을 확인해주세요. 기본 냉장고 기능은 계속 이용할 수 있습니다.',
      );
    const id = crypto.randomUUID();
    await this.mutate(ledgerId, (ledger) => {
      for (const entry of ledger.entries)
        if (entry.status === 'pending' && now - entry.at > 120000)
          entry.status = 'uncertain';
      if (
        ledger.halted ||
        ledger.total + reserved > 27000000 ||
        ledger.entries.length >= 1000
      )
        throw new BudgetError(429, exhausted);
      const own = ledger.entries.filter((e) => e.session === session);
      if (
        own.filter(
          (e) =>
            e.feature === feature && (feature !== 'briefing' || e.day === day),
        ).length >=
        (feature === 'analyze' ? 4 : feature === 'briefing' ? 5 : 15)
      )
        throw new BudgetError(429, exhausted);
      if (
        ledger.entries.filter((e) => e.status === 'pending').length >= 3 ||
        own.some(
          (e) =>
            e.status === 'pending' ||
            (remote && now - e.at < 3000) ||
            (e.key === key && (e.status === 'completed' || now - e.at < 60000)),
        )
      )
        throw new BudgetError(
          429,
          '이미 처리한 요청이거나 다른 AI 요청을 처리 중입니다. 기존 결과를 확인하거나 잠시 후 다시 시도해주세요.',
          'busy',
        );
      ledger.total += reserved;
      ledger.entries.push({
        id,
        key,
        session,
        feature,
        model: p?.model ?? 'mock',
        image,
        at: now,
        day,
        reserved,
        cost: reserved,
        cumulative: ledger.total,
        status: 'pending',
        usage: null,
        pricing: p,
      });
    });
    let usage: Usage | null = null;
    const settle = async (success: boolean) =>
      this.mutate(ledgerId, (ledger) => {
        const entry = ledger.entries.find((e) => e.id === id)!;
        if (
          usage &&
          usage.model === p?.model &&
          [usage.inputTokens, usage.outputTokens].every(
            (n) => Number.isSafeInteger(n) && n >= 0,
          )
        ) {
          entry.usage = usage;
          const actual = this.cost(
            p,
            usage.inputTokens,
            usage.outputTokens,
            image,
          );
          const over =
            usage.inputTokens > bounds.maxInputTokens ||
            usage.outputTokens > bounds.maxOutputTokens;
          const charge = success ? actual : Math.max(reserved, actual);
          ledger.total += charge - entry.cost;
          entry.cost = charge;
          if (over || actual > reserved) ledger.halted = true;
        }
        if (
          remote &&
          (!usage ||
            usage.model !== p?.model ||
            ![usage.inputTokens, usage.outputTokens].every(
              (n) => Number.isSafeInteger(n) && n >= 0,
            ))
        )
          ledger.halted = true;
        entry.status = success ? 'completed' : 'uncertain';
        entry.cumulative = ledger.total;
      });
    let result: T;
    try {
      result = await work({
        limits: bounds,
        reportUsage: (value) => {
          usage = structuredClone(value);
        },
      });
    } catch (error) {
      await settle(false);
      throw error;
    }
    await settle(true);
    await this.db
      .prepare('DELETE FROM ai_cache WHERE expires_at<=?')
      .bind(now)
      .run();
    await this.db
      .prepare(
        'INSERT OR REPLACE INTO ai_cache (cache_key,payload,expires_at) VALUES (?,?,?)',
      )
      .bind(key, JSON.stringify(result), now + 86400000)
      .run();
    return result;
  }
  async summary(remote = true) {
    const row = await this.db
      .prepare('SELECT snapshot FROM ai_budget WHERE id=?')
      .bind(remote ? 'championship-2026' : 'championship-2026-mock')
      .first<{ snapshot: string }>();
    const l: Ledger = row
      ? JSON.parse(row.snapshot)
      : { total: 0, halted: false, entries: [] };
    return {
      mode: remote ? 'remote' : 'mock',
      estimatedKrw: l.total / 1000,
      remainingKrw: Math.max(0, 27000 - l.total / 1000),
      level:
        l.halted || l.total >= 27000000 || l.entries.length >= 1000
          ? 'blocked'
          : l.total >= 25000000
            ? 'strong-warning'
            : l.total >= 20000000
              ? 'warning'
              : 'normal',
      requests: l.entries.length,
      byFeature: Object.fromEntries(
        ['analyze', 'interpret', 'briefing'].map((f) => [
          f,
          l.entries.filter((e) => e.feature === f).length,
        ]),
      ),
      inputTokens: l.entries.reduce(
        (n, e) => n + (e.usage?.inputTokens ?? 0),
        0,
      ),
      outputTokens: l.entries.reduce(
        (n, e) => n + (e.usage?.outputTokens ?? 0),
        0,
      ),
      unknownUsage: l.entries.filter((e) => !e.usage).length,
      recent: l.entries
        .slice(-50)
        .map(({ session: _session, key: _key, ...entry }) => entry),
    };
  }
}
