import { seed, type State } from './domain';
const KEY = 'naenglog.v1';
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;
const date = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v));
export function load(): State {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const s = seed();
    save(s);
    return s;
  }
  try {
    const s: unknown = JSON.parse(raw);
    if (
      !object(s) ||
      s.version !== 1 ||
      !object(s.user) ||
      s.user.mode !== 'demo' ||
      !Array.isArray(s.items) ||
      !Array.isArray(s.transactions) ||
      !Array.isArray(s.purchases) ||
      !Array.isArray(s.analyses) ||
      !Array.isArray(s.applied)
    )
      throw Error();
    if (
      s.items.some(
        (i: unknown) =>
          !object(i) ||
          typeof i.id !== 'string' ||
          typeof i.name !== 'string' ||
          typeof i.unit !== 'string' ||
          typeof i.quantity !== 'number' ||
          !Number.isFinite(i.quantity) ||
          i.quantity < 0 ||
          !date(i.expectedAt) ||
          !date(i.purchasedAt) ||
          typeof i.createdAt !== 'string' ||
          !['냉장', '냉동', '실온'].includes(String(i.storage)),
      )
    )
      throw Error();
    if (
      s.transactions.some(
        (t: unknown) =>
          !object(t) ||
          typeof t.id !== 'string' ||
          typeof t.itemId !== 'string' ||
          typeof t.name !== 'string' ||
          typeof t.at !== 'string' ||
          !Number.isFinite(Date.parse(t.at)) ||
          typeof t.detail !== 'string' ||
          ![
            'purchase',
            'consume',
            'dispose',
            'adjust',
            'storage_change',
          ].includes(String(t.action)),
      )
    )
      throw Error();
    if (
      s.purchases.some(
        (p: unknown) => !object(p) || typeof p.id !== 'string',
      ) ||
      s.applied.some((a: unknown) => typeof a !== 'string')
    )
      throw Error();
    return s as State;
  } catch {
    throw new Error(
      '저장된 데이터를 읽지 못했어요. 원본을 보존했으니 브라우저 저장소를 확인해주세요.',
    );
  }
}
export function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    throw new Error(
      '저장 공간에 접근하지 못했어요. 브라우저 설정이나 여유 공간을 확인해주세요. 변경은 적용되지 않았어요.',
    );
  }
}
