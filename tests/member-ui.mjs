// Local-only integration check. Start a migrated Worker with AI_PROVIDER=mock.
// PLAYWRIGHT_MODULE may point at the installed/bundled Playwright ESM entrypoint.
import assert from 'node:assert/strict';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4317';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'Never run this data-writing suite against production',
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TEST_BROWSER
    ? { executablePath: process.env.TEST_BROWSER }
    : {}),
});
const unique = String(Date.now()).slice(-8),
  password = 'Local-e2e-only-password-2026';
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  let modelCalls = 0;
  page.on('request', (request) => {
    if (
      request.url().endsWith('/api/ai') &&
      request.postDataJSON()?.operation !== 'config'
    )
      modelCalls++;
  });
  await page.goto(origin);
  await page.getByRole('heading', { name: '내 냉장고에 로그인' }).waitFor();
  assert.equal(
    (await context.request.get(origin + '/api/inventory')).status(),
    401,
  );
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('로컬 테스트');
  await page
    .getByLabel('이메일', { exact: true })
    .fill(`local${unique}@example.test`);
  await page.getByLabel('휴대전화번호').fill('010' + unique);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel('비밀번호 확인').fill(password);
  await page.getByLabel('자동 로그인', { exact: false }).check();
  await page
    .getByRole('button', { name: '회원가입', exact: true })
    .last()
    .click();
  await page.getByRole('heading', { name: '내 냉장고', exact: true }).waitFor();
  assert.equal(modelCalls, 0, 'Page entry must not call a model');
  const snapshot = await (
    await context.request.get(origin + '/api/inventory')
  ).json();
  assert.equal(snapshot.state.items.length, 0);
  const mode = await context.request.post(origin + '/api/ai', {
    headers: { Origin: origin },
    data: { operation: 'config' },
  });
  assert.equal(
    (await mode.json()).mode,
    'mock',
    'Local suite requires Mock mode',
  );
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
  const rows = ['계란', '두부', '대파'].map((name) => ({
    name,
    productName: name,
    quantity: 3,
    unit: '개',
    category: '식품',
    storage: '냉장',
    purchasedAt: date,
  }));
  const add = await context.request.post(origin + '/api/inventory', {
    headers: { Origin: origin },
    data: {
      kind: 'purchase',
      revision: 0,
      batchId: 'ui-' + unique,
      source: '직접 입력',
      rows,
    },
  });
  assert.equal(add.status(), 200);
  const aItems = (
    await (await context.request.get(origin + '/api/inventory')).json()
  ).state.items;
  const bContext = await browser.newContext();
  const bRegister = await bContext.request.post(origin + '/api/auth', {
    headers: { Origin: origin },
    data: {
      operation: 'register',
      name: '격리 테스트',
      email: `other${unique}@example.test`,
      phone: '011' + unique,
      password,
      confirmPassword: password,
    },
  });
  assert.equal(bRegister.status(), 201);
  const bPage = await bContext.newPage();
  await bPage.goto(origin);
  await bPage
    .getByRole('heading', { name: '내 냉장고', exact: true })
    .waitFor();
  assert.equal(
    (await (await bContext.request.get(origin + '/api/inventory')).json()).state
      .items.length,
    0,
  );
  const forged = await bContext.request.post(origin + '/api/inventory', {
    headers: { Origin: origin },
    data: {
      kind: 'command',
      revision: 0,
      userId: snapshot.state.user.id,
      command: {
        id: 'forged-' + unique,
        itemId: aItems[0].id,
        action: 'consume',
        quantity: 1,
      },
    },
  });
  assert.equal(forged.status(), 400);
  const foreignRecipe = await bContext.request.post(origin + '/api/ai', {
    headers: { Origin: origin },
    data: { operation: 'recipes', itemIds: aItems.map((i) => i.id) },
  });
  assert.equal(foreignRecipe.status(), 400);
  await bContext.close();
  await page.reload();
  await page.getByRole('heading', { name: '내 냉장고', exact: true }).waitFor();
  assert.equal(modelCalls, 0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: '냉장고', exact: true })
    .click();
  for (const name of ['계란', '두부', '대파'])
    await page.getByLabel(`${name} 레시피 재료 선택`).check();
  assert.equal(modelCalls, 0);
  await page.getByRole('button', { name: /선택한 재료로 레시피 추천/ }).click();
  await page
    .getByRole('heading', { name: '선택한 재료로 만드는 한 끼' })
    .waitFor();
  assert.equal(modelCalls, 1);
  assert.equal(
    await page.getByRole('button', { name: '자세히 보기' }).count(),
    3,
  );
  await page.getByRole('button', { name: '자세히 보기' }).first().click();
  await page.getByRole('heading', { name: '조리 순서' }).waitFor();
  assert.equal(modelCalls, 1);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'No mobile horizontal overflow',
  );
  const state = await context.storageState();
  assert.ok(
    state.cookies.some(
      (c) =>
        c.name === 'naenglog_auth' &&
        c.httpOnly &&
        c.expires > Date.now() / 1000 + 20 * 86400,
    ),
  );
  const reopened = await browser.newContext({ storageState: state });
  const back = await reopened.newPage();
  await back.goto(origin);
  await back.getByRole('heading', { name: '내 냉장고', exact: true }).waitFor();
  await back.getByRole('button', { name: '내 정보' }).click();
  await back.getByRole('button', { name: '로그아웃', exact: true }).click();
  await back.getByRole('heading', { name: '내 냉장고에 로그인' }).waitFor();
  assert.equal(
    (await context.request.get(origin + '/api/inventory')).status(),
    401,
  );
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(origin);
  await strangerPage
    .getByRole('heading', { name: '내 냉장고에 로그인' })
    .waitFor();
  assert.equal(
    await strangerPage.getByText('대파', { exact: true }).count(),
    0,
  );
  console.log(
    'PASS: registration, empty fridge, explicit single Mock recipe call, 3 recipes, detail, mobile width, persistent reopen, logout revocation, anonymous isolation',
  );
} finally {
  await browser.close();
}
