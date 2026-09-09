import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
  'image-input',
  'server/ai-provider',
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
      specifier.startsWith('.') ? "from '" + specifier + ".mjs'" : match,
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
  sql.exec(readFileSync('drizzle/0000_low_mandroid.sql', 'utf8'));
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
  return { repository: new InventoryRepository(db), sql };
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
    const aiHandler = createAIHandler(r, {});
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
    const disabled = createAIHandler(r, {
      AI_PROVIDER: 'remote',
      AI_API_KEY: 'not-a-real-key',
    });
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
