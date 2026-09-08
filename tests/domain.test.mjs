import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const out = path.join(tmpdir(), 'naenglog-tests-' + Date.now());
mkdirSync(out);
for (const name of ['domain', 'ai', 'storage']) {
  const code = ts
    .transpileModule(readFileSync(`src/${name}.ts`, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replaceAll("'./domain'", "'./domain.mjs'");
  writeFileSync(path.join(out, `${name}.mjs`), code);
}
const d = await import(pathToFileURL(path.join(out, 'domain.mjs')));
const { ai } = await import(pathToFileURL(path.join(out, 'ai.mjs')));
const storage = await import(pathToFileURL(path.join(out, 'storage.mjs')));
test('demo briefing prioritizes mushrooms and never includes expired items in menu', () => {
  const s = d.seed();
  assert.equal(d.ranked(s)[0].name, '버섯');
  assert.match(ai.briefing(s).title, /버섯/);
  s.items.forEach((i) => (i.expectedAt = d.addDays(d.today(), -1)));
  assert.equal(ai.briefing(s).menu, '');
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
  assert.equal(rows[0].productName, '서울우유 1L');
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

test('negated instructions do not consume inventory',async()=>{await assert.rejects(ai.interpret('계란 3개 안 썼어',d.seed()));});
test('image mock is explicit sample and missing quantity rejected',async()=>{assert.equal((await ai.analyze({source:'영수증'})).length,4);await assert.rejects(ai.analyze({source:'직접 입력',text:'우유'}));});
