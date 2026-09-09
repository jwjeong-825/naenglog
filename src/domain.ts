import { assertDraft, assertCommand, isQuantity } from './validation';
export type Storage = '냉장' | '냉동' | '실온';
export type Draft = {
  name: string;
  productName: string;
  quantity: number;
  unit: string;
  category: string;
  purchasedAt: string;
  storage: Storage;
};
export type Item = Draft & {
  id: string;
  createdAt: string;
  expectedAt: string;
  purchaseId: string;
};
export type Command = {
  id: string;
  itemId: string;
  action: 'consume' | 'dispose' | 'adjust' | 'storage_change';
  quantity?: number;
  storage?: Storage;
};
export type Transaction = {
  id: string;
  itemId: string;
  name: string;
  action: Command['action'] | 'purchase';
  before: number;
  after: number;
  at: string;
  detail: string;
};
export type State = {
  version: 1;
  user: { id: string; mode: 'demo' };
  items: Item[];
  purchases: { id: string; source: string; at: string }[];
  analyses: {
    id: string;
    provider: 'mock';
    source: string;
    at: string;
    result: Draft[];
  }[];
  transactions: Transaction[];
  applied: string[];
};
export const calendarDate = (value: Date | string) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
export const today = () => calendarDate(new Date());
export const id = () => crypto.randomUUID();
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysLeft = (date: string, now = today()) =>
  Math.round(
    (Date.parse(date + 'T12:00:00Z') - Date.parse(now + 'T12:00:00Z')) /
      86400000,
  );
export const foods: Record<
  string,
  {
    category: string;
    storage: Storage;
    days: [number, number, number];
    emoji: string;
  }
> = {
  버섯: { category: '채소', storage: '냉장', days: [5, 30, 1], emoji: '🍄' },
  닭가슴살: {
    category: '육류',
    storage: '냉장',
    days: [2, 60, 0],
    emoji: '🍗',
  },
  계란: { category: '달걀', storage: '냉장', days: [21, 0, 3], emoji: '🥚' },
  우유: { category: '유제품', storage: '냉장', days: [7, 30, 0], emoji: '🥛' },
  양파: { category: '채소', storage: '실온', days: [14, 30, 14], emoji: '🧅' },
  두부: {
    category: '가공식품',
    storage: '냉장',
    days: [5, 30, 0],
    emoji: '◻️',
  },
};
export function expected(d: Draft) {
  return addDays(
    d.purchasedAt,
    (foods[d.name]?.days ?? [3, 14, 1])[
      ['냉장', '냉동', '실온'].indexOf(d.storage)
    ],
  );
}
export function validateDraft(d: Draft) {
  assertDraft(d);
  if (
    !d.name.trim() ||
    d.name.length > 60 ||
    !d.unit.trim() ||
    d.unit.length > 10 ||
    !Number.isFinite(d.quantity) ||
    d.quantity <= 0 ||
    d.quantity > 10000
  )
    throw new Error('이름, 단위와 0보다 큰 수량을 확인해주세요.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d.purchasedAt) ||
    Number.isNaN(Date.parse(d.purchasedAt)) ||
    addDays(d.purchasedAt, 0) !== d.purchasedAt ||
    d.purchasedAt > today()
  )
    throw new Error('구매일은 오늘 또는 이전의 올바른 날짜여야 해요.');
  if (!['냉장', '냉동', '실온'].includes(d.storage))
    throw new Error('보관 방법을 선택해주세요.');
}
export function purchase(
  state: State,
  rows: Draft[],
  batchId: string,
  source: string,
): State {
  if (state.purchases.some((p) => p.id === batchId))
    throw new Error('이미 등록한 구매내역이에요.');
  if (!rows.length || rows.length > 50)
    throw new Error('식재료를 1~50개 입력해주세요.');
  rows = rows.map((d) => ({
    ...d,
    name: typeof d.name === 'string' ? d.name.trim() : d.name,
  }));
  rows.forEach(validateDraft);
  const at = new Date().toISOString();
  const items = rows.map((d) => ({
    ...d,
    name: d.name.trim(),
    id: id(),
    createdAt: at,
    expectedAt: expected(d),
    purchaseId: batchId,
  }));
  return {
    ...state,
    items: [...state.items, ...items],
    purchases: [...state.purchases, { id: batchId, source, at }],
    analyses: [
      ...state.analyses,
      { id: batchId, provider: 'mock', source, at, result: rows },
    ],
    transactions: [
      ...state.transactions,
      ...items.map((i) => ({
        id: id(),
        itemId: i.id,
        name: i.name,
        action: 'purchase' as const,
        before: 0,
        after: i.quantity,
        at,
        detail: source,
      })),
    ],
  };
}
export function apply(state: State, command: Command): State {
  assertCommand(command);
  if (state.applied.includes(command.id))
    throw new Error('이미 적용한 요청이에요.');
  const item = state.items.find((i) => i.id === command.itemId);
  if (!item) throw new Error('식재료를 찾지 못했어요.');
  const next = { ...item };
  if (command.action === 'storage_change') {
    if (!command.storage || !['냉장', '냉동', '실온'].includes(command.storage))
      throw new Error('보관 방법을 확인해주세요.');
    if (item.quantity === 0) throw new Error('남은 재고가 없어요.');
    if (command.storage === item.storage)
      throw new Error('이미 같은 곳에 보관 중이에요.');
    next.storage = command.storage;
    const estimate = expected(next);
    next.expectedAt =
      daysLeft(item.expectedAt) < 0
        ? estimate < item.expectedAt
          ? estimate
          : item.expectedAt
        : estimate;
  } else {
    const q = command.quantity;
    if (
      q === undefined ||
      !isQuantity(q) ||
      q < 0 ||
      q > 10000 ||
      (command.action !== 'adjust' && q === 0)
    )
      throw new Error('올바른 수량을 입력해주세요.');
    if (command.action !== 'adjust' && q > item.quantity)
      throw new Error(
        `현재 ${item.quantity}${item.unit} 남아 있어요. 수량을 다시 확인해주세요.`,
      );
    next.quantity =
      command.action === 'adjust'
        ? q
        : Math.round((item.quantity - q) * 1000) / 1000;
  }
  return {
    ...state,
    items: state.items.map((i) => (i.id === item.id ? next : i)),
    applied: [...state.applied, command.id],
    transactions: [
      ...state.transactions,
      {
        id: command.id,
        itemId: item.id,
        name: item.name,
        action: command.action,
        before: item.quantity,
        after: next.quantity,
        at: new Date().toISOString(),
        detail:
          command.action === 'storage_change'
            ? `${item.storage} → ${next.storage}`
            : `${item.quantity} → ${next.quantity}${item.unit}`,
      },
    ],
  };
}
export function ranked(state: State) {
  return state.items
    .filter((i) => i.quantity > 0)
    .map((i) => {
      const days = daysLeft(i.expectedAt);
      const age = -daysLeft(i.purchasedAt);
      const recent = state.transactions.some(
        (t) =>
          t.itemId === i.id &&
          t.action === 'consume' &&
          calendarDate(t.at) === today(),
      );
      const score =
        100 -
        days * 8 +
        Math.min(age, 14) +
        Math.min(i.quantity, 10) -
        (recent ? 3 : 0);
      return {
        ...i,
        days,
        score,
        reason: `${i.storage} 보관 · 구매 후 ${age}일, ${days < 0 ? '예상 시점이 지났어요' : `${days}일 여유`} · ${i.quantity}${i.unit} 남음`,
      };
    })
    .sort((a, b) => b.score - a.score);
}
export function seed(): State {
  let s: State = {
    version: 1,
    user: { id: id(), mode: 'demo' },
    items: [],
    purchases: [],
    analyses: [],
    transactions: [],
    applied: [],
  };
  const rows = [
    ['버섯', 1, '팩', 4],
    ['닭가슴살', 2, '개', 0],
    ['계란', 10, '개', 4],
    ['우유', 1, '개', 3],
    ['양파', 3, '개', 3],
  ] as const;
  s = purchase(
    s,
    rows.map(([name, quantity, unit, age]) => ({
      name,
      productName: name,
      quantity,
      unit,
      category: foods[name].category,
      storage: foods[name].storage,
      purchasedAt: addDays(today(), -age),
    })),
    id(),
    '시작용 데모',
  );
  return s;
}
