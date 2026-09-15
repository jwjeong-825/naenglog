import { assertResolution } from './receipt-resolution';
import type { Command, Draft, State } from './domain';
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 120): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export const isDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
const instant = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v));
export const isQuantity = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= 0 &&
  v <= 10000 &&
  Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-7;
const storage = (v: unknown) => ['냉장', '냉동', '실온'].includes(String(v));
export type DraftValidationReason =
  | 'invalid_draft_basic_fields'
  | 'invalid_quantity'
  | 'invalid_purchase_date'
  | 'invalid_expiry_date'
  | 'invalid_storage'
  | 'invalid_product_meaning'
  | 'normalized_food_name_mismatch'
  | 'invalid_weight_fields'
  | 'invalid_resolution';

export class DraftValidationError extends Error {
  constructor(public readonly reasonCode: DraftValidationReason) {
    super(reasonCode);
    this.name = 'DraftValidationError';
  }
}

const draftFail = (reasonCode: DraftValidationReason): never => {
  throw new DraftValidationError(reasonCode);
};
export function assertDraft(value: unknown): asserts value is Draft {
  if (!isRecord(value)) draftFail('invalid_draft_basic_fields');
  const draft = value as Record<string, unknown>;
  if (
    !text(draft.name, 60) ||
    !text(draft.productName, 120) ||
    !text(draft.category, 40) ||
    !text(draft.unit, 10)
  )
    draftFail('invalid_draft_basic_fields');
  if (!isQuantity(draft.quantity) || draft.quantity === 0)
    draftFail('invalid_quantity');
  if (!isDate(draft.purchasedAt)) draftFail('invalid_purchase_date');
  if (!storage(draft.storage)) draftFail('invalid_storage');
  if (
    draft.expiryDate !== undefined &&
    (!isDate(draft.expiryDate) || draft.expiryDate < String(draft.purchasedAt))
  )
    draftFail('invalid_expiry_date');
  if (draft.meaning !== undefined) {
    if (!isRecord(draft.meaning)) draftFail('invalid_product_meaning');
    const m = draft.meaning as Record<string, unknown>;
    if (m.normalizedFoodName !== draft.name)
      draftFail('normalized_food_name_mismatch');
    if (
      m.version !== 1 ||
      !(m.brand === null || text(m.brand, 60)) ||
      !(m.packaging === null || text(m.packaging, 40)) ||
      !Array.isArray(m.storageCandidates) ||
      !m.storageCandidates.length ||
      m.storageCandidates.length > 3 ||
      !m.storageCandidates.every(storage) ||
      ![true, false, null].includes(m.processed as boolean | null) ||
      ![true, false, null].includes(m.openingSensitive as boolean | null) ||
      !['high', 'low'].includes(String(m.confidence)) ||
      typeof m.confirmed !== 'boolean' ||
      !Array.isArray(m.reasons) ||
      !m.reasons.length ||
      m.reasons.length > 5 ||
      !m.reasons.every((r: unknown) => text(r, 300))
    )
      draftFail('invalid_product_meaning');
    if (m.resolution !== undefined) {
      const resolution = m.resolution;
      try {
        assertResolution(resolution);
      } catch {
        draftFail('invalid_resolution');
      }
      if ((resolution as { classification: unknown }).classification !== 'FOOD')
        draftFail('invalid_resolution');
    }
    if (m.weightPerUnit === null) {
      if (m.weightUnit !== null || m.totalWeight !== null)
        draftFail('invalid_weight_fields');
    } else if (
      !isQuantity(m.weightPerUnit) ||
      m.weightPerUnit <= 0 ||
      !['g', 'kg', 'ml', 'L'].includes(String(m.weightUnit)) ||
      typeof m.totalWeight !== 'number' ||
      !Number.isFinite(m.totalWeight) ||
      m.totalWeight <= 0
    )
      draftFail('invalid_weight_fields');
  }
}
export function assertCommand(value: unknown): asserts value is Command {
  if (
    !isRecord(value) ||
    !text(value.id) ||
    !text(value.itemId) ||
    !['consume', 'dispose', 'adjust', 'storage_change'].includes(
      String(value.action),
    )
  )
    throw new Error('변경 요청이 올바르지 않아요. 다시 입력해주세요.');
  if (value.action === 'storage_change') {
    if (!storage(value.storage) || value.quantity !== undefined)
      throw new Error('보관 변경 요청을 확인해주세요.');
  } else if (
    !isQuantity(value.quantity) ||
    (value.action !== 'adjust' && value.quantity === 0) ||
    value.storage !== undefined
  )
    throw new Error('수량은 소수점 셋째 자리까지, 0보다 크게 입력해주세요.');
}
export function assertState(value: unknown): asserts value is State {
  const fail = () => {
    throw new Error(
      '저장된 데이터 형식이 올바르지 않아요. 원본은 변경하지 않았어요.',
    );
  };
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.user) ||
    !text(value.user.id) ||
    value.user.mode !== 'demo' ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.purchases) ||
    !Array.isArray(value.transactions) ||
    !Array.isArray(value.analyses) ||
    !Array.isArray(value.applied)
  )
    return fail();
  const unique = (rows: unknown[]) => {
    const ids = rows.map((r) => (isRecord(r) ? r.id : undefined));
    return ids.every((x) => text(x)) && new Set(ids).size === ids.length;
  };
  if (
    ![value.items, value.purchases, value.transactions, value.analyses].every(
      unique,
    ) ||
    value.applied.some((x) => !text(x)) ||
    new Set(value.applied).size !== value.applied.length
  )
    return fail();
  const purchases = new Set(
    value.purchases.map((p: unknown) => (isRecord(p) ? p.id : undefined)),
  );
  const items = new Set(
    value.items.map((i: unknown) => (isRecord(i) ? i.id : undefined)),
  );
  for (const raw of value.items) {
    if (
      !isRecord(raw) ||
      !isQuantity(raw.quantity) ||
      !instant(raw.createdAt) ||
      !isDate(raw.expectedAt) ||
      !purchases.has(raw.purchaseId)
    )
      return fail();
    try {
      assertDraft({ ...raw, quantity: raw.quantity === 0 ? 1 : raw.quantity });
    } catch {
      return fail();
    }
  }
  for (const p of value.purchases)
    if (!isRecord(p) || !text(p.source) || !instant(p.at)) return fail();
  for (const a of value.analyses) {
    if (
      !isRecord(a) ||
      !purchases.has(a.id) ||
      !['mock', 'remote', 'fallback'].includes(String(a.provider)) ||
      !text(a.source) ||
      !instant(a.at) ||
      !Array.isArray(a.result) ||
      a.result.length < 1 ||
      a.result.length > 50
    )
      return fail();
    try {
      a.result.forEach(assertDraft);
    } catch {
      return fail();
    }
  }
  if (value.analyses.length !== value.purchases.length) return fail();
  const last = new Map<unknown, number>();
  for (const t of value.transactions) {
    if (
      !isRecord(t) ||
      !items.has(t.itemId) ||
      !text(t.name, 60) ||
      !text(t.detail, 200) ||
      !instant(t.at) ||
      !isQuantity(t.before) ||
      !isQuantity(t.after) ||
      !['purchase', 'consume', 'dispose', 'adjust', 'storage_change'].includes(
        String(t.action),
      )
    )
      return fail();
    if (t.action === 'purchase') {
      if (last.has(t.itemId) || t.before !== 0 || t.after <= 0) return fail();
    } else {
      if (last.get(t.itemId) !== t.before || !value.applied.includes(t.id))
        return fail();
      if (
        ['consume', 'dispose'].includes(String(t.action)) &&
        t.after >= t.before
      )
        return fail();
      if (t.action === 'storage_change' && t.after !== t.before) return fail();
    }
    last.set(t.itemId, t.after);
  }
  for (const i of value.items) if (last.get(i.id) !== i.quantity) return fail();
  const mutations = value.transactions.filter((t) => t.action !== 'purchase');
  if (mutations.length !== value.applied.length) return fail();
}
