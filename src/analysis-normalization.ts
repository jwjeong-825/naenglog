import type { AnalysisResult } from './analysis';
import type { Draft, Storage } from './domain';
import type {
  ExcludedProduct,
  PendingProduct,
  Resolution,
} from './receipt-resolution';
import { assertDraft, isDate, isQuantity, isRecord } from './validation';

const purchaseDateFallbackWarning =
  '구매일을 영수증에서 확정하지 못해 오늘 날짜를 사용했습니다. 등록 전 확인해주세요.';
const reviewReason =
  '분석 결과에서 확정하기 어려운 정보가 있어 이름·수량·단위를 직접 확인해주세요.';
const incompleteEvidence =
  'AI 분석 결과의 근거가 불완전하여 사용자 확인이 필요합니다.';
const storageValues: Storage[] = ['냉장', '냉동', '실온'];
const units = new Map<string, string>([
  ['개', '개'],
  ['개입', '개'],
  ['ea', '개'],
  ['pcs', '개'],
  ['팩', '팩'],
  ['봉', '봉'],
  ['봉지', '봉'],
  ['병', '병'],
  ['캔', '캔'],
  ['박스', '박스'],
  ['포', '포'],
  ['통', '통'],
  ['알', '알'],
  ['줄', '줄'],
  ['g', 'g'],
  ['kg', 'kg'],
  ['ml', 'ml'],
  ['l', 'L'],
]);

const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})([-./])(\d{2})\2(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const normalized = `${match[1]}-${match[3]}-${match[4]}`;
  return isDate(normalized) ? normalized : null;
};

const normalizeStrings = (value: unknown, maxItems: number, max: number) =>
  Array.isArray(value)
    ? value.filter((v): v is string => text(v, max)).slice(0, maxItems)
    : [];

const normalizeResolution = (
  value: unknown,
  classification: Resolution['classification'],
): Resolution => {
  const raw = isRecord(value) ? value : {};
  const score =
    typeof raw.score === 'number' &&
    Number.isFinite(raw.score) &&
    raw.score >= 0 &&
    raw.score <= 1
      ? raw.score
      : 0;
  const evidence = normalizeStrings(raw.evidence, 5, 300);
  return {
    classification,
    score,
    method: 'direct_ai',
    evidence: evidence.length ? evidence : [incompleteEvidence],
    candidates: normalizeStrings(raw.candidates, 3, 60),
  };
};

const normalizeUnit = (value: unknown) =>
  typeof value === 'string' ? units.get(value.trim().toLowerCase()) : undefined;

const normalizeStorageCandidates = (
  value: unknown,
  fallback: unknown,
): Storage[] => {
  const result = Array.isArray(value)
    ? value.filter((v): v is Storage => storageValues.includes(v as Storage))
    : [];
  if (!result.length && storageValues.includes(fallback as Storage))
    result.push(fallback as Storage);
  return [...new Set(result)].slice(0, 3);
};

const pendingFrom = (raw: Record<string, unknown>, reason = reviewReason) => {
  if (!text(raw.productName, 120)) return null;
  const meaning = isRecord(raw.meaning) ? raw.meaning : {};
  return {
    productName: raw.productName,
    reason,
    resolution: normalizeResolution(meaning.resolution, 'UNCERTAIN'),
  } satisfies PendingProduct;
};

const normalizeNotice = (
  value: unknown,
  classification: 'UNCERTAIN' | 'NON_FOOD',
): PendingProduct | ExcludedProduct | null => {
  if (!isRecord(value) || !text(value.productName, 120)) return null;
  return {
    productName: value.productName,
    reason: text(value.reason, 300) ? value.reason : reviewReason,
    resolution: normalizeResolution(value.resolution, classification),
  };
};

const normalizeRow = (
  value: unknown,
  suppliedToday: string,
  warnings: string[],
): { row?: Draft; pending?: PendingProduct } => {
  if (!isRecord(value)) return {};
  const raw = structuredClone(value);
  const pending = () => pendingFrom(raw) ?? undefined;
  if (!isRecord(raw.meaning)) return { pending: pending() };
  const meaning = raw.meaning;
  const quantity = raw.quantity;
  const unit = normalizeUnit(raw.unit);
  if (!isQuantity(quantity) || quantity <= 0 || !unit)
    return { pending: pending() };
  if (
    !text(raw.name, 60) ||
    !text(raw.productName, 120) ||
    !text(raw.category, 40) ||
    !text(meaning.normalizedFoodName, 60)
  )
    return { pending: pending() };

  const purchasedAt = normalizeDate(raw.purchasedAt);
  raw.purchasedAt = purchasedAt ?? suppliedToday;
  if (!purchasedAt && !warnings.includes(purchaseDateFallbackWarning))
    warnings.push(purchaseDateFallbackWarning);
  const expiryDate = normalizeDate(raw.expiryDate);
  if (expiryDate && expiryDate >= String(raw.purchasedAt))
    raw.expiryDate = expiryDate;
  else delete raw.expiryDate;

  const storageCandidates = normalizeStorageCandidates(
    meaning.storageCandidates,
    raw.storage,
  );
  if (!storageCandidates.length) return { pending: pending() };
  raw.storage = storageValues.includes(raw.storage as Storage)
    ? raw.storage
    : storageCandidates[0];
  raw.unit = unit;

  const resolution = normalizeResolution(meaning.resolution, 'FOOD');
  const reasons = normalizeStrings(meaning.reasons, 5, 300);
  const weightPerUnit = meaning.weightPerUnit;
  const weightUnit = meaning.weightUnit;
  const totalWeight = meaning.totalWeight;
  const expectedTotal =
    typeof weightPerUnit === 'number' && Number.isFinite(weightPerUnit)
      ? Math.round(weightPerUnit * quantity * 1000) / 1000
      : null;
  const validWeight =
    isQuantity(weightPerUnit) &&
    weightPerUnit > 0 &&
    ['g', 'kg', 'ml', 'L'].includes(String(weightUnit)) &&
    typeof totalWeight === 'number' &&
    Number.isFinite(totalWeight) &&
    totalWeight > 0 &&
    totalWeight === expectedTotal;

  const normalizedMeaning = {
    version: 1,
    resolution,
    normalizedFoodName: meaning.normalizedFoodName,
    brand: text(meaning.brand, 60) ? meaning.brand : null,
    weightPerUnit: validWeight ? weightPerUnit : null,
    weightUnit: validWeight ? weightUnit : null,
    totalWeight: validWeight ? totalWeight : null,
    packaging: text(meaning.packaging, 40) ? meaning.packaging : null,
    storageCandidates,
    processed: [true, false, null].includes(meaning.processed as boolean | null)
      ? meaning.processed
      : null,
    openingSensitive: [true, false, null].includes(
      meaning.openingSensitive as boolean | null,
    )
      ? meaning.openingSensitive
      : null,
    confidence: meaning.confidence === 'high' ? 'high' : 'low',
    reasons: reasons.length ? reasons : [incompleteEvidence],
    confirmed: false,
  };
  raw.meaning = normalizedMeaning;

  if (normalizedMeaning.confidence === 'low' || resolution.score < 0.7)
    return { pending: pendingFrom(raw) ?? undefined };
  try {
    assertDraft(raw);
    return { row: raw };
  } catch {
    return { pending: pending() };
  }
};

/**
 * Converts transport-valid model output into the stricter Naenglog domain.
 * This function is pure: it never logs, performs I/O, or mutates its input.
 */
export function normalizeAnalysisResult(
  raw: unknown,
  suppliedToday: string,
): AnalysisResult {
  if (
    !isRecord(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.rows) ||
    !Array.isArray(raw.unresolved) ||
    !(raw.excluded === null || Array.isArray(raw.excluded)) ||
    !Array.isArray(raw.warnings) ||
    !isDate(suppliedToday)
  )
    throw new Error('invalid_analysis_envelope');

  const warnings = normalizeStrings(raw.warnings, 10, 300);
  const rows: Draft[] = [];
  const unresolved = raw.unresolved
    .map((value) => normalizeNotice(value, 'UNCERTAIN'))
    .filter((value): value is PendingProduct => value !== null);
  const excluded = (raw.excluded ?? [])
    .map((value) => normalizeNotice(value, 'NON_FOOD'))
    .filter((value): value is ExcludedProduct => value !== null);

  for (const value of raw.rows) {
    const normalized = normalizeRow(value, suppliedToday, warnings);
    if (normalized.row) rows.push(normalized.row);
    else if (normalized.pending) unresolved.push(normalized.pending);
  }

  return { version: 1, rows, unresolved, excluded, warnings };
}
