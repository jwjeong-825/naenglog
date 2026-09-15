import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const out = path.join(tmpdir(), 'naenglog-tests-' + Date.now());
mkdirSync(out);
mkdirSync(path.join(out, 'server'));
for (const name of [
  'analysis',
  'receipt-resolution',
  'server/ai-budget',
  'server/ai-budget-admin',
  'image-input',
  'server/ai-provider',
  'server/openai-provider',
  'server/network-diagnostics',
  'server/ai-handlers',
  'product',
  'validation',
  'domain',
  'ai-service',
  'ai',
  'storage',
  'server/repository',
  'server/handlers',
]) {
  const code = ts
    .transpileModule(readFileSync(`src/${name}.ts`, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(/from '(.+?)'/g, (match, specifier) =>
      specifier.endsWith('.json')
        ? "from '" +
          pathToFileURL(path.resolve('schemas/analysis-result.schema.json'))
            .href +
          "'"
        : specifier.startsWith('.')
          ? "from '" + specifier + ".mjs'"
          : match,
    );
  writeFileSync(path.join(out, `${name}.mjs`), code);
}
const d = await import(pathToFileURL(path.join(out, 'domain.mjs')));
const { ai, buildMockBriefing } = await import(
  pathToFileURL(path.join(out, 'ai.mjs'))
);
const storage = await import(pathToFileURL(path.join(out, 'storage.mjs')));
test('demo briefing prioritizes mushrooms and never includes expired items in menu', () => {
  const s = d.seed();
  assert.equal(d.ranked(s)[0].name, '버섯');
  assert.match(buildMockBriefing(s).title, /버섯/);
  s.items.forEach((i) => (i.expectedAt = d.addDays(d.today(), -1)));
  assert.equal(buildMockBriefing(s).menu, '');
});
test('purchase → natural language → consume → freeze → persistence', async () => {
  let s = d.seed();
  const egg = s.items.find((i) => i.name === '계란');
  const c = await ai.interpret('계란 3개 썼어', s);
  s = d.apply(s, c);
  assert.equal(s.items.find((i) => i.id === egg.id).quantity, 7);
  assert.equal(s.transactions.at(-1).action, 'consume');
  const chicken = s.items.find((i) => i.name === '닭가슴살');
  s = d.apply(s, await ai.interpret('닭가슴살 냉동으로 옮겼어', s));
  assert.equal(s.items.find((i) => i.id === chicken.id).storage, '냉동');
  assert.ok(
    s.items.find((i) => i.id === chicken.id).expectedAt > chicken.expectedAt,
  );
  let data;
  globalThis.localStorage = {
    setItem: (k, v) => (data = v),
    getItem: () => data,
  };
  storage.save(s);
  assert.deepEqual(storage.load(), s);
});
test('reject excess, negative, NaN and duplicate actions', () => {
  const s = d.seed(),
    i = s.items[0];
  for (const quantity of [-1, NaN, Infinity, 1000])
    assert.throws(() =>
      d.apply(s, { id: d.id(), itemId: i.id, action: 'consume', quantity }),
    );
  const c = { id: d.id(), itemId: i.id, action: 'consume', quantity: 1 };
  assert.throws(() => d.apply(d.apply(s, c), c), /이미/);
  assert.throws(() => d.apply(d.apply(s, c), { ...c, id: d.id() }));
});
test('zero stock preserved, disposal distinct and no expired lifetime extension', async () => {
  let s = d.seed();
  s = d.apply(s, await ai.interpret('우유 다 버렸어', s));
  assert.equal(s.items.find((i) => i.name === '우유').quantity, 0);
  assert.equal(s.transactions.at(-1).action, 'dispose');
  const chicken = s.items.find((i) => i.name === '닭가슴살');
  chicken.expectedAt = d.addDays(d.today(), -1);
  s = d.apply(s, {
    id: d.id(),
    itemId: chicken.id,
    action: 'storage_change',
    storage: '냉동',
  });
  assert.equal(
    s.items.find((i) => i.id === chicken.id).expectedAt,
    chicken.expectedAt,
  );
});
test('manual parsing separates product and name, validates dates and batch identity', async () => {
  const rows = await ai.analyze({
    source: '직접 입력',
    text: '서울우유 1L 2개\n계란 10개',
  });
  assert.equal(rows[0].name, '우유');
  assert.equal(rows[0].productName, '서울우유 1L 2개');
  rows.forEach((row) => (row.meaning.confirmed = true));
  let s = d.seed();
  s = d.purchase(s, rows, 'batch', '직접 입력');
  assert.throws(() => d.purchase(s, rows, 'batch', '직접 입력'));
  assert.throws(() =>
    d.validateDraft({ ...rows[0], purchasedAt: '2026-02-30' }),
  );
  assert.throws(() =>
    d.validateDraft({ ...rows[0], purchasedAt: d.addDays(d.today(), 1) }),
  );
});
test('ambiguous quantities, duplicate items and mismatched units do not mutate', async () => {
  const s = d.seed();
  await assert.rejects(ai.interpret('우유 버렸어', s));
  await assert.rejects(ai.interpret('계란 3kg 썼어', s));
  s.items.push({ ...s.items.find((i) => i.name === '계란'), id: d.id() });
  await assert.rejects(ai.interpret('계란 3개 썼어', s));
});
test('failed and corrupt storage do not pretend to succeed', () => {
  globalThis.localStorage = {
    setItem: () => {
      throw Error();
    },
    getItem: () => '{broken',
  };
  assert.throws(() => storage.save(d.seed()), /저장/);
  assert.throws(() => storage.load(), /보존/);
});
process.on('exit', () => rmSync(out, { recursive: true, force: true }));

test('negated instructions do not consume inventory', async () => {
  await assert.rejects(ai.interpret('계란 3개 안 썼어', d.seed()));
});
test('image mock is explicit sample and missing quantity rejected', async () => {
  assert.equal((await ai.analyze({ source: '영수증' })).length, 4);
  await assert.rejects(ai.analyze({ source: '직접 입력', text: '우유' }));
});

const { createAIService } = await import(
  pathToFileURL(path.join(out, 'ai-service.mjs'))
);
const { assertState } = await import(
  pathToFileURL(path.join(out, 'validation.mjs'))
);
test('unknown actions and precision loss cannot mutate inventory', () => {
  const s = d.seed();
  assert.throws(() =>
    d.apply(s, {
      id: d.id(),
      itemId: s.items[0].id,
      action: 'delete',
      quantity: 1,
    }),
  );
  assert.throws(() =>
    d.apply(s, {
      id: d.id(),
      itemId: s.items[0].id,
      action: 'consume',
      quantity: 0.0001,
    }),
  );
});
test('storage rejects malformed dates, broken references and forged balances', () => {
  for (const mutate of [
    (s) => (s.items[0].expectedAt = '2026-02-30'),
    (s) => (s.items[0].quantity = 99),
    (s) => (s.items[0].purchaseId = 'missing'),
    (s) => (s.analyses[0].result[0].name = 4),
    (s) => (s.transactions[0].before = -1),
  ]) {
    const s = d.seed();
    mutate(s);
    assert.throws(() => assertState(s));
  }
});
test('read denial is friendly and corrupted snapshots are never overwritten', () => {
  let writes = 0;
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('SecurityError internal');
    },
    setItem: () => writes++,
  };
  assert.throws(() => storage.load(), /저장 공간을 읽을 수 없어요/);
  globalThis.localStorage.getItem = () => '';
  assert.throws(() => storage.load(), /보존/);
  assert.equal(writes, 0);
});
test('provider rejects malformed JSON, invalid rows and invented inventory', async () => {
  const s = d.seed();
  for (const output of ['{invalid', [{ name: '계란', quantity: 3 }], null]) {
    const service = createAIService({
      mode: 'remote',
      analyze: async () => output,
    });
    await assert.rejects(
      service.analyze({ source: '직접 입력' }),
      (e) => e.code === 'invalid_response',
    );
  }
  const service = createAIService({
    mode: 'remote',
    interpret: async () => ({
      id: d.id(),
      itemId: 'invented',
      action: 'consume',
      quantity: 1,
    }),
  });
  await assert.rejects(
    service.interpret('계란 1개 썼어', s),
    (e) => e.code === 'invalid_response',
  );
});
test('provider timeouts abort work and external errors stay private', async () => {
  let aborted = false;
  const service = createAIService(
    {
      mode: 'remote',
      analyze: (_, options) =>
        new Promise(() => {
          options.signal.addEventListener('abort', () => (aborted = true));
        }),
    },
    10,
  );
  await assert.rejects(
    service.analyze({ source: '영수증' }),
    (e) => e.code === 'timeout',
  );
  assert.equal(aborted, true);
  const broken = createAIService({
    mode: 'remote',
    analyze: async () => {
      throw new Error('secret provider token');
    },
  });
  await assert.rejects(
    broken.analyze({ source: '영수증' }),
    (e) => !e.message.includes('secret'),
  );
});
test('ambiguous compound commands and negative quantities are rejected', async () => {
  for (const command of [
    '계란 -3개 썼어',
    '계란 3개 썼어 2개 버렸어',
    '계란 3개 안썼어',
    '계란 3개쯤 썼어',
  ])
    await assert.rejects(ai.interpret(command, d.seed()));
});
test('storage move uses destination, not first storage word', async () => {
  const s = d.seed();
  const command = await ai.interpret('닭가슴살 냉장으로 옮겼어', s);
  assert.equal(command.storage, '냉장');
  const move = await ai.interpret('닭가슴살 냉장에서 냉동으로 옮겼어', s);
  assert.equal(move.storage, '냉동');
});

const { DatabaseSync } = await import('node:sqlite');
const { InventoryRepository } = await import(
  pathToFileURL(path.join(out, 'server/repository.mjs'))
);
const { createInventoryHandlers } = await import(
  pathToFileURL(path.join(out, 'server/handlers.mjs'))
);
function makeRepository() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync('drizzle/' + file, 'utf8'));
  const db = {
    prepare: (query) => ({
      bind: (...values) => ({
        first: async () => sql.prepare(query).get(...values) ?? null,
        run: async () => ({
          meta: { changes: sql.prepare(query).run(...values).changes },
        }),
      }),
    }),
  };
  return { repository: new InventoryRepository(db), sql, db };
}
test('database migration and session ownership isolate visitors', async () => {
  const { repository: r, sql } = makeRepository();
  try {
    const a = await r.create('visitor-a'),
      b = await r.create('visitor-b');
    assert.notEqual(a.state.user.id, b.state.user.id);
    const egg = a.state.items.find((i) => i.name === '계란');
    const result = await r.change('visitor-a', {
      kind: 'command',
      revision: 0,
      command: { id: d.id(), itemId: egg.id, action: 'consume', quantity: 3 },
    });
    assert.equal(result.state.items.find((i) => i.id === egg.id).quantity, 7);
    assert.equal(
      (await r.find('visitor-b')).state.items.find((i) => i.name === '계란')
        .quantity,
      10,
    );
    await assert.rejects(
      r.change('visitor-b', {
        kind: 'command',
        revision: 0,
        command: { id: d.id(), itemId: egg.id, action: 'consume', quantity: 1 },
      }),
    );
  } finally {
    sql.close();
  }
});
test('optimistic concurrency prevents lost updates and replay double consumption', async () => {
  const { repository: r, sql } = makeRepository();
  try {
    const a = await r.create('a'),
      egg = a.state.items.find((i) => i.name === '계란');
    const command = {
      id: d.id(),
      itemId: egg.id,
      action: 'consume',
      quantity: 3,
    };
    await r.change('a', { kind: 'command', revision: 0, command });
    const replay = await r.change('a', {
      kind: 'command',
      revision: 0,
      command,
    });
    assert.equal(replay.revision, 1);
    const attempts = await Promise.allSettled([
      r.change('a', {
        kind: 'command',
        revision: 1,
        command: { ...command, id: d.id() },
      }),
      r.change('a', {
        kind: 'command',
        revision: 1,
        command: { ...command, id: d.id() },
      }),
    ]);
    assert.equal(attempts.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(
      attempts.find((x) => x.status === 'rejected').reason.status,
      409,
    );
    assert.equal(
      (await r.find('a')).state.items.find((i) => i.name === '계란').quantity,
      4,
    );
  } finally {
    sql.close();
  }
});
test('legacy import is validated, atomic and cannot overwrite existing server work', async () => {
  const { repository: r, sql } = makeRepository();
  try {
    await r.create('a');
    const legacy = d.seed();
    const result = await r.change('a', {
      kind: 'import',
      revision: 0,
      state: legacy,
    });
    assert.equal(result.state.user.id, legacy.user.id);
    await assert.rejects(
      r.change('a', { kind: 'import', revision: 1, state: d.seed() }),
      (e) => e.status === 409,
    );
    const invalid = structuredClone(legacy);
    invalid.items[0].quantity = 100;
    await r.create('b');
    await assert.rejects(
      r.change('b', { kind: 'import', revision: 0, state: invalid }),
    );
    assert.equal((await r.find('b')).revision, 0);
  } finally {
    sql.close();
  }
});
test('HTTP API protects session cookies and rejects cross-origin or malformed writes', async () => {
  const { repository: r, sql } = makeRepository();
  try {
    const api = createInventoryHandlers(r),
      response = await api.GET(
        new Request('https://fridge.test/api/inventory'),
      );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('set-cookie'),
      /HttpOnly; SameSite=Strict/,
    );
    assert.match(response.headers.get('set-cookie'), /Secure/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const post = (origin, body) =>
      api.POST(
        new Request('https://fridge.test/api/inventory', {
          method: 'POST',
          headers: {
            Origin: origin,
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body,
        }),
      );
    assert.equal((await post('https://attacker.test', '{}')).status, 403);
    assert.equal((await post('https://fridge.test', '{broken')).status, 400);
    assert.equal(
      (
        await api.POST(
          new Request('https://fridge.test/api/inventory', {
            method: 'POST',
            headers: {
              Origin: 'https://fridge.test',
              'Content-Type': 'application/json',
            },
            body: '{}',
          }),
        )
      ).status,
      401,
    );
  } finally {
    sql.close();
  }
});

test('calendar dates agree at Korean midnight regardless of server timezone', () => {
  assert.equal(d.calendarDate('2026-09-08T15:00:00Z'), '2026-09-09');
  assert.equal(d.calendarDate('2026-09-08T14:59:59Z'), '2026-09-08');
});

test('product semantics preserve packaging, composite meals and explicit review', async () => {
  const rows = await ai.analyze({
    source: '직접 입력',
    text: '하림 닭가슴살 블랙페퍼 100g 5팩\n닭가슴살 샐러드 1팩',
  });
  assert.equal(rows[0].name, '닭가슴살');
  assert.equal(rows[0].meaning.brand, '하림');
  assert.equal(rows[0].meaning.totalWeight, 500);
  assert.equal(rows[0].meaning.processed, true);
  assert.equal(rows[1].name, '닭가슴살 샐러드');
  assert.equal(rows[1].category, '완제품');
  assert.equal(rows[1].meaning.weightPerUnit, null);
  assert.throws(
    () => d.purchase(d.seed(), rows, 'unreviewed', '직접 입력'),
    /확인/,
  );
  rows.forEach((r) => (r.meaning.confirmed = true));
  const state = d.purchase(d.seed(), rows, 'reviewed', '직접 입력');
  assert.equal(state.items.at(-2).meaning.totalWeight, 500);
  const after = d.apply(state, {
    id: d.id(),
    itemId: state.items.at(-2).id,
    action: 'consume',
    quantity: 1,
  });
  const { assertState } = await import(
    pathToFileURL(path.join(out, 'validation.mjs'))
  );
  assertState(after);
  assert.equal(after.items.at(-2).quantity, 4);
  assert.equal(after.items.at(-2).meaning.totalWeight, 500); // original purchase total, not remaining weight
  const invalid = structuredClone(rows);
  invalid[0].meaning.totalWeight = 100;
  assert.throws(
    () => d.purchase(d.seed(), invalid, 'invalid', '직접 입력'),
    /중량/,
  );
});
test('expired inventory takes precedence even with usable inventory', () => {
  const state = d.seed();
  const milk = state.items.find((i) => i.name === '우유');
  milk.expectedAt = d.addDays(d.today(), -1);
  assert.match(buildMockBriefing(state).title, /우유.*상태 확인/);
  assert.equal(buildMockBriefing(state).menu, '');
});

test('partial recognition preserves unresolved products and resets provider confirmation', async () => {
  const result = await ai.analyzeDetailed({
    source: '직접 입력',
    text: '계란 10개\n알 수 없는 상품',
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.unresolved.length, 1);
  const service = createAIService({
    mode: 'remote',
    analyze: async () => ({
      ...result,
      rows: result.rows.map((r) => ({
        ...r,
        meaning: { ...r.meaning, confirmed: true },
      })),
    }),
  });
  assert.equal(
    (await service.analyzeDetailed({ source: '영수증' })).rows[0].meaning
      .confirmed,
    false,
  );
  const broken = createAIService({
    mode: 'remote',
    analyze: async () => ({
      ...result,
      rows: [{ ...result.rows[0], meaning: undefined }],
    }),
  });
  await assert.rejects(broken.analyzeDetailed({ source: '영수증' }));
});
test('server AI requires own session, validates image bytes, and runs without external AI', async () => {
  const { createAIHandler } = await import(
    pathToFileURL(path.join(out, 'server/ai-handlers.mjs'))
  );
  const { repository: r, sql } = makeRepository();
  try {
    const inventory = createInventoryHandlers(r);
    const first = await inventory.GET(
      new Request('https://naenglog.test/api/inventory'),
    );
    const cookie = first.headers.get('set-cookie').split(';')[0];
    const aiHandler = createAIHandler(r, {}, databaseFor(sql));
    const send = (body, extra = {}) =>
      aiHandler(
        new Request('https://naenglog.test/api/ai', {
          method: 'POST',
          headers: {
            Origin: 'https://naenglog.test',
            'Content-Type': 'application/json',
            Cookie: cookie,
            ...extra,
          },
          body: JSON.stringify(body),
        }),
      );
    assert.equal(
      (await send({ operation: 'briefing' }, { Origin: 'https://evil.test' }))
        .status,
      403,
    );
    assert.equal(
      (await send({ operation: 'briefing' }, { Cookie: '' })).status,
      401,
    );
    assert.equal(
      (
        await send({
          operation: 'analyze',
          input: {
            source: '영수증',
            image: { mimeType: 'image/png', base64: btoa('not png') },
          },
        })
      ).status,
      400,
    );
    const image = {
      mimeType: 'image/png',
      base64: readFileSync('tests/fixtures/receipt.png').toString('base64'),
    };
    const analysis = await send({
      operation: 'analyze',
      input: { source: '영수증', image },
    });
    assert.equal(analysis.status, 200);
    const body = await analysis.json();
    assert.equal(body.mode, 'mock');
    assert.equal(body.result.rows.length, 4);
    assert.ok(body.result.warnings.length);
    assert.ok(body.result.rows.every((r) => !r.meaning.confirmed));
    const move = await send({
      operation: 'interpret',
      text: '닭가슴살 냉동으로 옮겼어',
    });
    assert.equal((await move.json()).result.storage, '냉동');
    const disabled = createAIHandler(
      r,
      {
        AI_PROVIDER: 'remote',
        AI_API_KEY: 'not-a-real-key',
      },
      databaseFor(sql),
    );
    const unavailable = await disabled(
      new Request('https://naenglog.test/api/ai', {
        method: 'POST',
        headers: {
          Origin: 'https://naenglog.test',
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ operation: 'briefing' }),
      }),
    );
    assert.equal(unavailable.status, 503);
    assert.ok(!(await unavailable.text()).includes('not-a-real-key'));
  } finally {
    sql.close();
  }
});
test('image input rejects oversized data and MIME mismatch', async () => {
  const { validateImage, MAX_IMAGE_BYTES } = await import(
    pathToFileURL(path.join(out, 'image-input.mjs'))
  );
  assert.throws(() =>
    validateImage({
      mimeType: 'image/png',
      base64: 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4),
    }),
  );
  assert.throws(() =>
    validateImage({
      mimeType: 'image/jpeg',
      base64: readFileSync('tests/fixtures/receipt.png').toString('base64'),
    }),
  );
});

test('representative mock pipeline supports confirmed purchase, briefing, consumption and storage move', async () => {
  const result = await ai.analyzeDetailed({ source: '영수증' });
  const initial = d.seed();
  for (const key of [
    'items',
    'purchases',
    'analyses',
    'transactions',
    'applied',
  ])
    initial[key] = [];
  result.rows.forEach((r) => (r.meaning.confirmed = true));
  let state = d.purchase(initial, result.rows, 'demo-full', '영수증');
  assert.ok((await ai.briefing(state)).title);
  state = d.apply(state, await ai.interpret('계란 3개 썼어', state));
  assert.equal(state.items.find((i) => i.name === '계란').quantity, 7);
  state = d.apply(state, await ai.interpret('닭가슴살 냉동으로 옮겼어', state));
  assert.equal(state.items.find((i) => i.name === '닭가슴살').storage, '냉동');
  const { assertState } = await import(
    pathToFileURL(path.join(out, 'validation.mjs'))
  );
  assertState(state);
});

function databaseFor(sql) {
  return {
    prepare: (query) => ({
      bind: (...v) => ({
        first: async () => sql.prepare(query).get(...v) ?? null,
        run: async () => ({
          meta: { changes: sql.prepare(query).run(...v).changes },
        }),
      }),
    }),
  };
}
const { AIBudget } = await import(
  pathToFileURL(path.join(out, 'server/ai-budget.mjs'))
);
const budgetEnv = (now) => ({
  AI_MODEL: 'synthetic',
  AI_PROJECT_ID: 'test-only',
  AI_HARD_LIMIT_VERIFIED: 'true',
  AI_PRICING_JSON: JSON.stringify({
    model: 'synthetic',
    currency: 'USD',
    inputPerMillion: 1,
    outputPerMillion: 2,
    imagePerRequest: 0,
    krwPerCurrency: 1000,
    verifiedAt: new Date(now).toISOString(),
  }),
});
test('budget cache, trial quota, mock isolation and admin protection', async () => {
  const { sql, db } = makeRepository();
  let now = Date.now();
  const b = new AIBudget(db, {}, () => now);
  let calls = 0;
  const work = async () => {
    calls++;
    return { ok: true };
  };
  for (let i = 0; i < 20; i++) {
    await b.run('one', 'analyze', false, true, i, work);
    now += 4000;
  }
  await b.run('one', 'analyze', false, true, 0, work);
  assert.equal(calls, 20);
  await assert.rejects(
    b.run('one', 'analyze', false, true, 20, work),
    (e) => e.status === 429,
  );
  await b.run('two', 'analyze', false, true, 0, work);
  assert.equal(calls, 21);
  assert.equal((await b.summary(false)).estimatedKrw, 0);
  assert.equal((await b.summary()).requests, 0);
  const { budgetStatus } = await import(
    pathToFileURL(path.join(out, 'server/ai-budget-admin.mjs'))
  );
  assert.equal(
    (await budgetStatus(new Request('https://test'), db, {})).status,
    404,
  );
  const secret = 'x'.repeat(32);
  const response = await budgetStatus(
    new Request('https://test', {
      headers: { Authorization: 'Bearer ' + secret },
    }),
    db,
    { AI_BUDGET_ADMIN_TOKEN: secret },
  );
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes('session'));
  sql.close();
});
test('atomic reservations cap concurrent spending and preserve uncertain charges', async () => {
  const { sql, db } = makeRepository();
  const now = Date.now();
  const env = budgetEnv(now);
  const b = new AIBudget(db, env, () => now);
  sql
    .prepare('INSERT INTO ai_budget VALUES (?,?,0)')
    .run(
      'championship-2026',
      JSON.stringify({ total: 26990000, halted: false, entries: [] }),
    );
  let release;
  const waiting = new Promise((r) => (release = r));
  let started = 0;
  const results = await Promise.allSettled([
    b.run('a', 'interpret', true, false, 'a', async () => {
      started++;
      await waiting;
      return {};
    }),
    b.run('b', 'interpret', true, false, 'b', async () => {
      started++;
      await waiting;
      return {};
    }),
    Promise.resolve().then(async () => {
      await new Promise((r) => setTimeout(r, 30));
      release();
    }),
  ]);
  assert.equal(started, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  // Each reservation is 8.4 KRW; only 1.6 KRW remains.
  await assert.rejects(
    b.run('c', 'interpret', true, false, 'c', async () => ({})),
    (e) => e.status === 429,
  );
  assert.equal((await b.summary()).estimatedKrw, 26998.4);
  sql.close();
});
test('usage settlement, duplicate pending, invalid response and pricing fail closed', async () => {
  const { sql, db } = makeRepository();
  let now = Date.now();
  const env = budgetEnv(now);
  const b = new AIBudget(db, env, () => now);
  await assert.rejects(
    new AIBudget(db, {}).run('a', 'analyze', true, true, 1, async () => ({})),
    (e) => e.status === 503,
  );
  let release;
  const wait = new Promise((r) => (release = r));
  const first = b.run('a', 'interpret', true, false, 'same', async (o) => {
    assert.equal(o.limits.maxRetries, 0);
    await wait;
    o.reportUsage({ model: 'synthetic', inputTokens: 100, outputTokens: 50 });
    return { ok: true };
  });
  await new Promise((r) => setTimeout(r, 10));
  await assert.rejects(
    b.run('a', 'interpret', true, false, 'same', async () => ({})),
    (e) => e.status === 429,
  );
  release();
  await first;
  assert.equal((await b.summary()).estimatedKrw, 0.24);
  now += 4000;
  await assert.rejects(
    b.run('a', 'interpret', true, false, 'bad-json', async (o) => {
      o.reportUsage({ model: 'synthetic', inputTokens: 1, outputTokens: 1 });
      throw new Error('invalid JSON');
    }),
  );
  assert.equal((await b.summary()).estimatedKrw, 8.64);
  now += 8000;
  await b.run('b', 'interpret', true, false, 'over', async (o) => {
    o.reportUsage({ model: 'synthetic', inputTokens: 6001, outputTokens: 1 });
    return {};
  });
  assert.equal((await b.summary()).level, 'blocked');
  sql.close();
});
test('briefing resets at Korean midnight but lifetime analysis quota does not', async () => {
  const { sql, db } = makeRepository();
  let now = Date.parse('2026-09-09T14:00:00Z');
  const b = new AIBudget(db, {}, () => now);
  for (let i = 0; i < 5; i++)
    await b.run('a', 'briefing', false, false, i, async () => ({}));
  await assert.rejects(
    b.run('a', 'briefing', false, false, 6, async () => ({})),
    (e) => e.status === 429,
  );
  now = Date.parse('2026-09-09T15:00:00Z');
  await b.run('a', 'briefing', false, false, 7, async () => ({}));
  sql.close();
});

test('expired reservations remain charged after restart and inventory remains writable', async () => {
  const { repository: r, sql, db } = makeRepository();
  let now = Date.now();
  const b = new AIBudget(db, budgetEnv(now), () => now);
  const pending = {
    id: 'old',
    key: 'old',
    session: 'old',
    feature: 'interpret',
    model: 'synthetic',
    image: false,
    at: now - 130000,
    day: 'old',
    reserved: 8400,
    cost: 8400,
    cumulative: 8400,
    status: 'pending',
    usage: null,
    pricing: null,
  };
  sql
    .prepare('INSERT INTO ai_budget VALUES (?,?,0)')
    .run(
      'championship-2026',
      JSON.stringify({ total: 8400, halted: false, entries: [pending] }),
    );
  await b.run('new', 'interpret', true, false, 'new', async (o) => {
    o.reportUsage({ model: 'synthetic', inputTokens: 100, outputTokens: 50 });
    return {};
  });
  const status = await b.summary();
  assert.equal(status.estimatedKrw, 8.64);
  assert.equal(status.recent[0].status, 'uncertain');
  const initial = await r.create('new');
  const egg = initial.state.items.find((i) => i.name === '계란');
  sql
    .prepare('UPDATE ai_budget SET snapshot=? WHERE id=?')
    .run(
      JSON.stringify({ total: 27000000, halted: true, entries: [] }),
      'championship-2026',
    );
  await assert.rejects(
    b.run('new', 'interpret', true, false, 'blocked', async () => ({})),
    (e) => e.status === 429,
  );
  const changed = await r.change('new', {
    kind: 'command',
    revision: initial.revision,
    command: { id: d.id(), itemId: egg.id, action: 'consume', quantity: 3 },
  });
  assert.equal(changed.state.items.find((i) => i.id === egg.id).quantity, 7);
  now += 8 * 86400000;
  await assert.rejects(
    b.run('other', 'interpret', true, false, 1, async () => ({})),
    (e) => e.status === 503,
  );
  sql.close();
});

const { validateAnalysis } = await import(
  pathToFileURL(path.join(out, 'analysis.mjs'))
);
const resolution = await import(
  pathToFileURL(path.join(out, 'receipt-resolution.mjs'))
);
test('receipt classification preserves uncertain products and excludes non-food', async () => {
  const result = await resolution.resolveReceipt(
    [
      '서울우유 나100% 1L',
      '비비고 왕교자 1봉',
      '대패삼겹살 600g',
      '휴지 1개',
      '샴푸 2개',
      '서울 1000',
      '참P 500',
    ],
    new AbortController().signal,
  );
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].name, '우유');
  assert.equal(result.rows[1].name, '만두');
  assert.equal(result.rows[1].meaning.brand, '비비고');
  assert.equal(result.rows[1].storage, '냉동');
  assert.equal(result.rows[2].name, '돼지고기');
  assert.equal(result.excluded.length, 2);
  assert.equal(result.unresolved.length, 2);
  assert.deepEqual(result.unresolved[0].resolution.candidates, [
    '우유',
    '두유',
    '요구르트',
  ]);
  assert.ok(result.unresolved.every((i) => i.resolution.score < 0.7));
  const v = validateAnalysis(result);
  assert.ok(v.rows.every((r) => !r.meaning.confirmed));
  const allExcluded = await resolution.resolveReceipt(
    ['세제 1개'],
    new AbortController().signal,
  );
  assert.equal(validateAnalysis(allExcluded).excluded.length, 1);
});
test('bounded exploration handles failure, unknown products and cancellation without guessing', async () => {
  let calls = 0;
  const explorer = {
    resolve: async () => {
      calls++;
      throw new Error('private search token');
    },
  };
  const result = await resolution.resolveReceipt(
    ['냉동A', '행사상품1', '청정2호', '알수없음'],
    new AbortController().signal,
    explorer,
  );
  assert.equal(calls, 3);
  assert.equal(result.rows.length, 0);
  assert.equal(result.unresolved.length, 4);
  assert.ok(!JSON.stringify(result).includes('private search token'));
  const controller = new AbortController();
  const work = resolution.resolveReceipt(['서울 1000'], controller.signal, {
    resolve: () => new Promise(() => {}),
  });
  controller.abort();
  await assert.rejects(work);
  const invalid = await resolution.resolveReceipt(
    ['서울 1000'],
    new AbortController().signal,
    { resolve: async () => ({ bad: true }) },
  );
  assert.equal(invalid.rows.length, 0);
  assert.deepEqual(invalid.unresolved[0].resolution.candidates, []);
});
test('candidate correction requires final confirmation and preserves label expiry through storage changes', async () => {
  const draft = resolution.confirmCandidate('서울 1000', '우유', 2, '팩');
  draft.expiryDate = d.addDays(d.today(), 2);
  assert.throws(() => d.purchase(d.seed(), [draft], d.id(), '영수증'));
  draft.meaning.confirmed = true;
  const bought = d.purchase(d.seed(), [draft], d.id(), '영수증');
  const item = bought.items.at(-1);
  assert.equal(item.expectedAt, draft.expiryDate);
  const moved = d.apply(bought, {
    id: d.id(),
    itemId: item.id,
    action: 'storage_change',
    storage: '냉동',
  });
  assert.equal(moved.items.at(-1).expectedAt, draft.expiryDate);
  const bad = structuredClone(draft);
  bad.meaning.resolution.score = 1.1;
  assert.throws(() => d.purchase(d.seed(), [bad], d.id(), '영수증'));
  bad.meaning.resolution.score = 0.5;
  bad.meaning.resolution.classification = 'NON_FOOD';
  assert.throws(() => d.purchase(d.seed(), [bad], d.id(), '영수증'));
});

test('receipt price never becomes inventory quantity', async () => {
  const r = await resolution.resolveReceipt(
    ['계란 10개 3,000원', '우유 1000원'],
    new AbortController().signal,
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].quantity, 10);
  assert.equal(r.unresolved.length, 1);
});

test('exploration timeout aborts provider work and keeps product for manual review', async () => {
  let signal;
  const r = await resolution.resolveReceipt(
    ['서울 1000'],
    new AbortController().signal,
    {
      resolve: (_, o) => {
        signal = o.signal;
        return new Promise(() => {});
      },
    },
  );
  assert.equal(signal.aborted, true);
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.rows.length, 0);
});

const { createOpenAIProvider, openAIAnalysisSchema } = await import(
  pathToFileURL(path.join(out, 'server/openai-provider.mjs'))
);
const { limits: aiLimits } = await import(
  pathToFileURL(path.join(out, 'server/ai-budget.mjs'))
);
const { selectProvider } = await import(
  pathToFileURL(path.join(out, 'server/ai-provider.mjs'))
);
const openEnv = () => ({
  ...budgetEnv(Date.now()),
  AI_PROVIDER: 'openai',
  AI_API_KEY: 'test-only-placeholder',
  AI_MODEL: 'gpt-5.4-mini',
  AI_PRICING_JSON: JSON.stringify({
    model: 'gpt-5.4-mini',
    currency: 'USD',
    inputPerMillion: 0.75,
    outputPerMillion: 4.5,
    imagePerRequest: 0,
    krwPerCurrency: 1000,
    verifiedAt: new Date().toISOString(),
  }),
});
const openOptions = (feature = 'analyze') => ({
  signal: new AbortController().signal,
  limits: aiLimits(feature),
  reportUsage: () => {},
});
const openResponse = (result, patch = {}) =>
  Response.json({
    model: 'gpt-5.4-mini-2026-03-17',
    status: 'completed',
    usage: { input_tokens: 1000, output_tokens: 100 },
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
      },
    ],
    ...patch,
  });
async function openFixture() {
  const result = await ai.analyzeDetailed({
    source: '직접 입력',
    text: '계란 2개\n서울1000\n휴지 1개',
  });
  for (const entry of [
    ...result.rows.map((r) => r.meaning),
    ...result.unresolved,
    ...result.excluded,
  ])
    entry.resolution.method = 'direct_ai';
  for (const row of result.rows) {
    row.expiryDate = null;
    row.meaning.confidence = 'high';
    row.meaning.resolution.score = 0.95;
  }
  return result;
}
test('OpenAI strict schema makes every object property required without changing domain schema', () => {
  function walk(s) {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual(s.required.sort(), Object.keys(s.properties).sort());
    }
    for (const v of Object.values(s))
      if (Array.isArray(v)) v.forEach(walk);
      else walk(v);
  }
  walk(structuredClone(openAIAnalysisSchema));
  assert.ok(
    openAIAnalysisSchema.properties.rows.items.properties.expiryDate.anyOf,
  );
});
test('analysis validation reports privacy-safe reason codes for each domain rule', async () => {
  const base = await openFixture();
  base.rows[0].expiryDate = d.addDays(base.rows[0].purchasedAt, 1);
  const cases = [
    ['invalid_analysis_envelope', (x) => delete x.version],
    ['invalid_warning_or_notice', (x) => x.warnings.push('')],
    ['invalid_product_notice', (x) => (x.unresolved[0].extra = true)],
    ['invalid_draft_basic_fields', (x) => (x.rows[0].unit = '')],
    ['invalid_quantity', (x) => (x.rows[0].quantity = 0.0001)],
    ['invalid_purchase_date', (x) => (x.rows[0].purchasedAt = '2026-02-30')],
    ['invalid_expiry_date', (x) => (x.rows[0].expiryDate = '2020-01-01')],
    ['invalid_storage', (x) => (x.rows[0].storage = '상온')],
    [
      'invalid_product_meaning',
      (x) => (x.rows[0].meaning.storageCandidates = []),
    ],
    [
      'invalid_weight_fields',
      (x) => {
        x.rows[0].meaning.weightPerUnit = null;
        x.rows[0].meaning.weightUnit = 'g';
      },
    ],
    [
      'invalid_total_weight',
      (x) => {
        x.rows[0].meaning.weightPerUnit = 10;
        x.rows[0].meaning.weightUnit = 'g';
        x.rows[0].meaning.totalWeight = 999;
      },
    ],
    ['invalid_resolution', (x) => (x.rows[0].meaning.resolution.evidence = [])],
    ['invalid_analysis_fields', (x) => (x.unexpected = true)],
    [
      'empty_analysis',
      (x) => {
        x.rows = [];
        x.unresolved = [];
        x.excluded = [];
      },
    ],
  ];
  for (const [reasonCode, mutate] of cases) {
    const value = structuredClone(base);
    mutate(value);
    assert.throws(
      () => validateAnalysis(value),
      (error) =>
        error.reasonCode === reasonCode && error.message === reasonCode,
      reasonCode,
    );
  }
});
test('receipt, display and normalized food names may differ by design', async () => {
  const value = await openFixture();
  const row = value.rows[0];
  row.productName = '서울우1L';
  row.name = '서울우유';
  row.meaning.normalizedFoodName = '우유';
  delete row.expiryDate;
  const validated = validateAnalysis(value);
  assert.equal(validated.rows[0].productName, '서울우1L');
  assert.equal(validated.rows[0].name, '서울우유');
  assert.equal(validated.rows[0].meaning.normalizedFoodName, '우유');
  for (const invalidName of ['', '가'.repeat(61)]) {
    const invalid = structuredClone(value);
    invalid.rows[0].meaning.normalizedFoodName = invalidName;
    assert.throws(
      () => validateAnalysis(invalid),
      (error) => error.reasonCode === 'invalid_product_meaning',
    );
  }
});
test('OpenAI initial domain validation preserves the specific reason code', async () => {
  const fixture = await openFixture();
  fixture.rows[0].quantity = 0.0001;
  let diagnostic;
  const p = createOpenAIProvider(openEnv(), async () => openResponse(fixture));
  await assert.rejects(
    p.analyze(
      { source: '직접 입력', text: '테스트 입력' },
      { ...openOptions(), reportDiagnostic: (value) => (diagnostic = value) },
    ),
    (error) => error.code === 'invalid_response',
  );
  assert.equal(diagnostic.stage, 'domain');
  assert.equal(diagnostic.reasonCode, 'invalid_quantity');
  assert.ok(!JSON.stringify(diagnostic).includes('테스트 입력'));
});
test('OpenAI image analysis preserves three classifications, usage and confirmation with one Responses request', async () => {
  const fixture = await openFixture();
  let calls = 0,
    usage;
  const p = createOpenAIProvider(openEnv(), async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.ok(init.signal);
    assert.equal(init.redirect, 'manual');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.deepEqual(body.tools, []);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 3000);
    assert.equal(body.reasoning.effort, 'none');
    assert.equal(body.input[0].content[1].detail, 'high');
    assert.match(
      body.input[0].content[1].image_url,
      /^data:image\/png;base64,/,
    );
    assert.match(body.instructions, /untrusted DATA/);
    return openResponse(fixture);
  });
  const result = await p.analyze(
    {
      source: '영수증',
      image: {
        mimeType: 'image/png',
        base64: readFileSync('tests/fixtures/receipt.png').toString('base64'),
      },
    },
    { ...openOptions(), reportUsage: (u) => (usage = u) },
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.rows[0].meaning.confirmed, false);
  assert.equal(result.rows[0].expiryDate, undefined);
  assert.equal(calls, 1);
  assert.deepEqual(usage, {
    model: 'gpt-5.4-mini',
    inputTokens: 1000,
    outputTokens: 100,
  });
});
test('OpenAI low confidence remains unresolved rather than an invented confirmed product', async () => {
  const f = await openFixture();
  f.rows[0].meaning.confidence = 'low';
  f.rows[0].meaning.resolution.score = 0.5;
  const p = createOpenAIProvider(openEnv(), async () => openResponse(f));
  const r = await p.analyze(
    { source: '직접 입력', text: '계란 2개' },
    openOptions(),
  );
  assert.equal(r.rows.length, 0);
  assert.equal(r.unresolved.length, 2);
  assert.deepEqual(validateAnalysis(r), r);
  assert.deepEqual(Object.keys(r.unresolved.at(-1)).sort(), [
    'productName',
    'reason',
    'resolution',
  ]);
  assert.equal(r.unresolved.at(-1).resolution.classification, 'UNCERTAIN');
});
test('OpenAI rejects malformed JSON, schema, refusal, incomplete and unexpected model', async () => {
  for (const [body, patch] of [
    ['not json', {}],
    [{ version: 1, rows: [{}], unresolved: [], warnings: [] }, {}],
    [{}, { status: 'incomplete' }],
    [{}, { model: 'unexpected-model' }],
    [
      {},
      {
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'no' }] },
        ],
      },
    ],
  ]) {
    const p = createOpenAIProvider(openEnv(), async () =>
      openResponse(body, patch),
    );
    await assert.rejects(
      p.analyze({ source: '직접 입력', text: '계란 2개' }, openOptions()),
      (e) => e.code === 'invalid_response',
    );
  }
});
test('OpenAI configuration and request limits fail before fetch; mock stays available', async () => {
  for (const env of [
    {},
    { AI_API_KEY: 'test-only-placeholder' },
    { AI_MODEL: 'gpt-5.4-mini' },
    { AI_API_KEY: 'test-only-placeholder', AI_MODEL: 'other' },
  ])
    assert.throws(() => createOpenAIProvider(env));
  assert.equal(selectProvider({ AI_PROVIDER: 'mock' }).mode, 'mock');
  assert.equal(selectProvider(openEnv()).mode, 'remote');
  let calls = 0;
  const p = createOpenAIProvider(openEnv(), async () => {
    calls++;
    throw Error('must not call');
  });
  await assert.rejects(
    p.analyze(
      {
        source: '영수증',
        image: { mimeType: 'image/png', base64: btoa('invalid') },
      },
      openOptions(),
    ),
  );
  await assert.rejects(
    p.analyze({ source: '직접 입력', text: '가'.repeat(12000) }, openOptions()),
  );
  await assert.rejects(
    p.analyze(
      { source: '직접 입력', text: '계란' },
      { ...openOptions(), limits: { ...aiLimits('analyze'), maxRetries: 1 } },
    ),
  );
  assert.equal(calls, 0);
});
test('OpenAI API errors are private and never retried or replaced with mock success', async () => {
  let calls = 0;
  const p = createOpenAIProvider(openEnv(), async () => {
    calls++;
    return new Response('test-only-placeholder upstream secret', {
      status: 429,
    });
  });
  await assert.rejects(
    p.analyze({ source: '직접 입력', text: '계란' }, openOptions()),
    (e) => e.code === 'unavailable' && !e.message.includes('placeholder'),
  );
  assert.equal(calls, 1);
});
test('OpenAI timeout aborts the same single network request', async () => {
  let calls = 0,
    aborted = false;
  const p = createOpenAIProvider(openEnv(), async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init.signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(new Error('aborted'));
        },
        { once: true },
      ),
    );
  });
  const wrapped = {
    ...p,
    analyze: (i, o) => p.analyze(i, { ...openOptions(), signal: o.signal }),
  };
  await assert.rejects(
    createAIService(wrapped, 20).analyzeDetailed({
      source: '직접 입력',
      text: '계란',
    }),
    (e) => e.code === 'timeout',
  );
  assert.equal(calls, 1);
  assert.equal(aborted, true);
});
test('OpenAI command proposals never write inventory and reject ambiguous or excessive changes', async () => {
  const state = d.seed(),
    before = structuredClone(state),
    egg = state.items.find((i) => i.name === '계란');
  const proposal = {
    kind: 'command',
    itemId: egg.id,
    action: 'consume',
    quantity: 3,
    storage: null,
    message: null,
  };
  let response = proposal;
  const p = createOpenAIProvider(openEnv(), async () => openResponse(response));
  const command = await p.interpret(
    '계란 3개 썼어',
    state,
    openOptions('interpret'),
  );
  assert.equal(command.quantity, 3);
  assert.equal(command.itemId, egg.id);
  assert.deepEqual(state, before);
  response = { ...proposal, quantity: 100 };
  assert.ok(
    'message' in
      (await p.interpret('계란 100개 썼어', state, openOptions('interpret'))),
  );
  state.items.push({ ...egg, id: d.id() });
  response = proposal;
  assert.ok(
    'message' in
      (await p.interpret('계란 3개 썼어', state, openOptions('interpret'))),
  );
  response = {
    kind: 'message',
    itemId: null,
    action: null,
    quantity: null,
    storage: null,
    message: '몇 개를 사용했나요?',
  };
  assert.ok(
    'message' in
      (await p.interpret('계란 썼어', state, openOptions('interpret'))),
  );
});
test('OpenAI briefing uses ranked minimal state and suppresses menu for past dates', async () => {
  const state = d.seed();
  let request;
  const p = createOpenAIProvider(openEnv(), async (_u, i) => {
    request = JSON.parse(i.body);
    return openResponse({
      title: '먼저 상태 확인',
      message: '제품 표시와 상태를 확인해주세요.',
      menu: '계란찜',
    });
  });
  const result = await p.briefing(state, openOptions('briefing'));
  assert.equal(result.menu, '계란찜');
  const payload = request.input[0].content[0].text;
  assert.ok(!payload.includes(state.user.id));
  assert.match(payload, /"days"/);
  state.items[0].expectedAt = d.addDays(d.today(), -1);
  assert.equal((await p.briefing(state, openOptions('briefing'))).menu, '');
});
test('OpenAI HTTP integration checks budget before fetch, records usage and serves cached result', async () => {
  const { createAIHandler } = await import(
    pathToFileURL(path.join(out, 'server/ai-handlers.mjs'))
  );
  const { repository, sql, db } = makeRepository();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    const first = await createInventoryHandlers(repository).GET(
      new Request('https://naenglog.test/api/inventory'),
    );
    const cookie = first.headers.get('set-cookie').split(';')[0];
    globalThis.fetch = async () => {
      calls++;
      return openResponse({
        title: '확인',
        message: '제품 상태를 확인해주세요.',
        menu: '',
      });
    };
    const send = (handler) =>
      handler(
        new Request('https://naenglog.test/api/ai', {
          method: 'POST',
          headers: {
            Origin: 'https://naenglog.test',
            'Content-Type': 'application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({ operation: 'briefing' }),
        }),
      );
    assert.equal(
      (
        await send(
          createAIHandler(
            repository,
            { ...openEnv(), AI_PRICING_JSON: '' },
            db,
          ),
        )
      ).status,
      503,
    );
    assert.equal(calls, 0);
    const env = openEnv(),
      handler = createAIHandler(repository, env, db);
    const result = await send(handler);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).mode, 'remote');
    assert.equal(calls, 1);
    assert.equal((await send(handler)).status, 200);
    assert.equal(calls, 1);
    const summary = await new AIBudget(db, env).summary();
    assert.equal(summary.inputTokens, 1000);
    assert.equal(summary.outputTokens, 100);
    assert.equal(summary.estimatedKrw, 1.44);
    assert.equal(summary.recent[0].status, 'completed');
  } finally {
    globalThis.fetch = originalFetch;
    sql.close();
  }
});

test('OpenAI oversized preflight releases only unsent reservation without disabling other users', async () => {
  const { db, sql } = makeRepository();
  const env = openEnv();
  let calls = 0;
  try {
    const budget = new AIBudget(db, env),
      p = createOpenAIProvider(env, async () => {
        calls++;
        throw Error('unexpected call');
      });
    await assert.rejects(
      budget.run('oversized', 'analyze', true, false, 'large', (o) =>
        p.analyze(
          { source: '직접 입력', text: '가'.repeat(12000) },
          { ...o, signal: new AbortController().signal },
        ),
      ),
      (e) => e.code === 'input_limit',
    );
    const state = await budget.summary();
    assert.equal(calls, 0);
    assert.equal(state.estimatedKrw, 0);
    assert.equal(state.level, 'normal');
    assert.equal(state.requests, 1);
  } finally {
    sql.close();
  }
});

test('OpenAI diagnostics preserve only allowlisted protocol metadata', async () => {
  let diagnostic;
  const p = createOpenAIProvider(openEnv(), async () =>
    Response.json(
      {
        error: {
          code: 'invalid_json_schema',
          type: 'invalid_request_error',
          param: 'text.format.schema',
          message:
            'PRIVATE_INPUT test-only-placeholder data:image/png;base64,secret',
        },
      },
      { status: 400, headers: { 'x-request-id': 'req_0123456789abcdef' } },
    ),
  );
  await assert.rejects(
    p.briefing(d.seed(), {
      ...openOptions('briefing'),
      reportDiagnostic: (x) => (diagnostic = x),
    }),
  );
  assert.equal(diagnostic.stage, 'http');
  assert.equal(diagnostic.httpStatus, 400);
  assert.equal(diagnostic.errorCode, 'invalid_json_schema');
  assert.equal(diagnostic.parameter, 'text.format.schema');
  assert.equal(diagnostic.requestId, 'req_0123456789abcdef');
  assert.ok(!JSON.stringify(diagnostic).includes('PRIVATE_INPUT'));
  assert.ok(!JSON.stringify(diagnostic).includes('placeholder'));
  const poisoned = createOpenAIProvider(openEnv(), async () =>
    Response.json(
      {
        error: {
          code: 'PRIVATE_INPUT',
          type: 'test-only-placeholder',
          param: 'data:image/png;base64,secret',
        },
      },
      { status: 401, headers: { 'x-request-id': 'test-only-placeholder' } },
    ),
  );
  await assert.rejects(
    poisoned.briefing(d.seed(), {
      ...openOptions('briefing'),
      reportDiagnostic: (x) => (diagnostic = x),
    }),
  );
  assert.equal(diagnostic.errorCode, 'other');
  assert.equal(diagnostic.errorType, 'other');
  assert.equal(diagnostic.requestId, null);
});

test('OpenAI failure stages distinguish network, JSON, model, usage and structured output', async () => {
  for (const [stage, fetcher] of [
    [
      'network',
      async () => {
        throw Error('PRIVATE_INPUT');
      },
    ],
    ['json', async () => new Response('not json')],
    ['model', async () => openResponse({}, { model: 'wrong-model' })],
    ['usage', async () => openResponse({}, { usage: null })],
    [
      'structured_output',
      async () => openResponse({}, { status: 'incomplete' }),
    ],
  ]) {
    let diagnostic;
    const p = createOpenAIProvider(openEnv(), fetcher);
    await assert.rejects(
      p.briefing(d.seed(), {
        ...openOptions('briefing'),
        reportDiagnostic: (x) => (diagnostic = x),
      }),
    );
    assert.equal(diagnostic.stage, stage);
    assert.equal(diagnostic.networkError, stage === 'network');
    assert.equal(diagnostic.dispatched, true);
  }
});

test('Definite preflight cancellation releases reservation; dispatched failures remain halted', async () => {
  for (const preflight of [true, false]) {
    const { db, sql } = makeRepository();
    let calls = 0;
    const p = createOpenAIProvider(openEnv(), async () => {
      calls++;
      throw Error('PRIVATE_INPUT');
    });
    const controller = new AbortController();
    if (preflight) controller.abort('cancelled');
    try {
      const budget = new AIBudget(db, openEnv());
      await assert.rejects(
        budget.run('diagnostic', 'briefing', true, false, {}, (o) =>
          p.briefing(d.seed(), { ...o, signal: controller.signal }),
        ),
      );
      const s = await budget.summary();
      assert.equal(calls, preflight ? 0 : 1);
      assert.equal(s.level, preflight ? 'normal' : 'blocked');
      assert.equal(s.estimatedKrw === 0, preflight);
      assert.equal(s.requests, 1);
      assert.equal(s.recent[0].diagnostic.dispatched, !preflight);
      assert.ok(
        !JSON.stringify(s.recent[0].diagnostic).includes('PRIVATE_INPUT'),
      );
    } finally {
      sql.close();
    }
  }
});

test('Budget persists timeout diagnostics without resetting uncertain costs', async () => {
  const { db, sql } = makeRepository();
  try {
    const budget = new AIBudget(db, openEnv());
    const p = createOpenAIProvider(
      openEnv(),
      async (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener(
            'abort',
            () => reject(Error('PRIVATE_INPUT')),
            { once: true },
          ),
        ),
    );
    await assert.rejects(
      budget.run('timeout', 'briefing', true, false, {}, (extra) =>
        createAIService(
          {
            ...p,
            briefing: (s, o) => p.briefing(s, { ...o, ...extra }),
          },
          20,
        ).briefing(d.seed()),
      ),
      (e) => e.code === 'timeout',
    );
    const s = await budget.summary();
    assert.equal(s.level, 'blocked');
    assert.equal(s.recent[0].diagnostic.timeout, true);
    assert.equal(s.recent[0].diagnostic.dispatched, true);
    assert.ok(s.estimatedKrw > 0);
  } finally {
    sql.close();
  }
});

test('Approved receipt recovery preserves unknown costs and history and is idempotent', () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(
      'CREATE TABLE ai_budget(id TEXT PRIMARY KEY,snapshot TEXT NOT NULL,revision INTEGER NOT NULL)',
    );
    const original = {
      total: 12358,
      halted: true,
      entries: [
        {
          status: 'uncertain',
          usage: null,
          cost: 12358,
          reserved: 12358,
          id: 'prior',
        },
      ],
    };
    sql
      .prepare('INSERT INTO ai_budget VALUES(?,?,?)')
      .run('championship-2026', JSON.stringify(original), 2);
    const migration = readFileSync(
      'drizzle/0002_receipt_test_recovery.sql',
      'utf8',
    );
    sql.exec(migration);
    const first = sql.prepare('SELECT * FROM ai_budget').get(),
      after = JSON.parse(first.snapshot);
    assert.equal(after.halted, false);
    assert.equal(after.total, original.total);
    assert.deepEqual(after.entries, original.entries);
    assert.equal(after.receiptTest.remaining, 1);
    assert.equal(first.revision, 3);
    sql.exec(migration);
    assert.deepEqual(sql.prepare('SELECT * FROM ai_budget').get(), first);
    sql.prepare('UPDATE ai_budget SET snapshot=?,revision=2').run(
      JSON.stringify({
        ...original,
        entries: [
          { status: 'completed', usage: { inputTokens: 1 }, cost: 12358 },
        ],
      }),
    );
    sql.exec(migration);
    assert.equal(
      JSON.parse(sql.prepare('SELECT snapshot FROM ai_budget').get().snapshot)
        .halted,
      true,
    );
  } finally {
    sql.close();
  }
});

test('Receipt recovery allows only one globally reserved image and blocks background AI', async () => {
  const { db, sql } = makeRepository();
  try {
    const ledger = {
      total: 12358,
      halted: false,
      entries: [],
      receiptTest: { remaining: 1, recovery: 'test' },
    };
    sql
      .prepare('INSERT INTO ai_budget VALUES(?,?,?)')
      .run('championship-2026', JSON.stringify(ledger), 3);
    const budget = new AIBudget(db, openEnv());
    let calls = 0;
    const work = async (o) => {
      calls++;
      o.reportUsage({
        model: 'gpt-5.4-mini',
        inputTokens: 10,
        outputTokens: 10,
      });
      return { ok: true };
    };
    await assert.rejects(budget.run('home', 'briefing', true, false, {}, work));
    await assert.rejects(budget.run('text', 'analyze', true, false, {}, work));
    assert.equal(calls, 0);
    const results = await Promise.allSettled([
      budget.run('one', 'analyze', true, true, { image: '1' }, work),
      budget.run('two', 'analyze', true, true, { image: '2' }, work),
    ]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(calls, 1);
    await assert.rejects(
      budget.run('three', 'analyze', true, true, { image: '3' }, work),
    );
    assert.equal(calls, 1);
    const row = sql
      .prepare('SELECT snapshot FROM ai_budget WHERE id=?')
      .get('championship-2026');
    const saved = JSON.parse(row.snapshot);
    assert.equal(saved.receiptTest.remaining, 0);
    assert.equal(saved.entries.length, 1);
    assert.ok(saved.total >= 12358);
  } finally {
    sql.close();
  }
});

test('Network categories never return raw exception text', async () => {
  const { classifyNetworkError } = await import(
    pathToFileURL(path.join(out, 'server/network-diagnostics.mjs'))
  );
  for (const [error, category] of [
    [{ cause: { code: 'ENOTFOUND' }, message: 'PRIVATE' }, 'dns_failure'],
    [{ code: 'CERT_HAS_EXPIRED' }, 'tls_failure'],
    [{ code: 'ECONNREFUSED' }, 'connection_refused'],
    [{ code: 'ECONNRESET' }, 'connection_reset'],
    [{ message: 'Fetch is not allowed PRIVATE' }, 'runtime_restriction'],
    [{ message: 'Invalid header value PRIVATE' }, 'request_construction'],
    [{ message: 'PRIVATE' }, 'generic_network_failure'],
  ])
    assert.equal(classifyNetworkError(error), category);
});

test('Network probes are cached fixed HEAD requests without credentials or inference', async () => {
  const { networkProbe } = await import(
    pathToFileURL(path.join(out, 'server/network-diagnostics.mjs'))
  );
  const calls = [];
  const fake = async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 403 });
  };
  const results = await networkProbe(fake);
  await networkProbe(fake);
  assert.equal(calls.length, 3);
  for (const { url, options } of calls) {
    assert.ok(
      ['https://example.com/', 'https://api.openai.com/'].includes(url),
    );
    assert.equal(options.method, 'HEAD');
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
  }
  assert.ok(results.every((x) => x.httpStatus === 403));
});
