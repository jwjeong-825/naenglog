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
const MAX_RESOLUTION_EVIDENCE = 5;
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
  ['모', '모'],
  ['단', '단'],
  ['구', '구'],
  ['입', '개'],
  ['알', '알'],
  ['줄', '줄'],
  ['g', 'g'],
  ['kg', 'kg'],
  ['ml', 'ml'],
  ['l', 'L'],
]);

type ClearFood = {
  normalizedFoodName: string;
  category: string;
  storage: Storage;
  defaultUnit: string;
};
const clearFoods: Array<[RegExp, ClearFood]> = [
  [
    /계란|달걀/,
    {
      normalizedFoodName: '계란',
      category: '달걀',
      storage: '냉장',
      defaultUnit: '개',
    },
  ],
  [
    /진간장|국간장|양조간장|간장/,
    {
      normalizedFoodName: '간장',
      category: '조미료',
      storage: '실온',
      defaultUnit: '병',
    },
  ],
  [
    /신라면|라면/,
    {
      normalizedFoodName: '라면',
      category: '가공식품',
      storage: '실온',
      defaultUnit: '봉',
    },
  ],
  [
    /우유/,
    {
      normalizedFoodName: '우유',
      category: '유제품',
      storage: '냉장',
      defaultUnit: '팩',
    },
  ],
  [
    /김치/,
    {
      normalizedFoodName: '김치',
      category: '반찬',
      storage: '냉장',
      defaultUnit: '팩',
    },
  ],
  [
    /만두|왕교자/,
    {
      normalizedFoodName: '만두',
      category: '냉동식품',
      storage: '냉동',
      defaultUnit: '봉',
    },
  ],
  [
    /두부/,
    {
      normalizedFoodName: '두부',
      category: '가공식품',
      storage: '냉장',
      defaultUnit: '모',
    },
  ],
  [
    /생수|먹는샘물/,
    {
      normalizedFoodName: '생수',
      category: '음료',
      storage: '실온',
      defaultUnit: '병',
    },
  ],
  [
    /요구르트|요거트/,
    {
      normalizedFoodName: '요구르트',
      category: '유제품',
      storage: '냉장',
      defaultUnit: '개',
    },
  ],
  [
    /햇반|즉석밥/,
    {
      normalizedFoodName: '즉석밥',
      category: '가공식품',
      storage: '실온',
      defaultUnit: '개',
    },
  ],
  [
    /참기름/,
    {
      normalizedFoodName: '참기름',
      category: '조미료',
      storage: '실온',
      defaultUnit: '병',
    },
  ],
  [
    /식용유/,
    {
      normalizedFoodName: '식용유',
      category: '조미료',
      storage: '실온',
      defaultUnit: '병',
    },
  ],
  [
    /소스/,
    {
      normalizedFoodName: '소스',
      category: '조미료',
      storage: '냉장',
      defaultUnit: '병',
    },
  ],
  [
    /과자/,
    {
      normalizedFoodName: '과자',
      category: '간식',
      storage: '실온',
      defaultUnit: '봉',
    },
  ],
  [
    /빵/,
    {
      normalizedFoodName: '빵',
      category: '베이커리',
      storage: '실온',
      defaultUnit: '개',
    },
  ],
  [
    /음료|주스/,
    {
      normalizedFoodName: '음료',
      category: '음료',
      storage: '냉장',
      defaultUnit: '병',
    },
  ],
  [
    /고기|삼겹살|돼지고기|소고기|닭고기/,
    {
      normalizedFoodName: '고기',
      category: '육류',
      storage: '냉장',
      defaultUnit: '팩',
    },
  ],
  [
    /채소|야채/,
    {
      normalizedFoodName: '채소',
      category: '채소',
      storage: '냉장',
      defaultUnit: '팩',
    },
  ],
  [
    /대파|쪽파|실파/,
    {
      normalizedFoodName: '대파',
      category: '채소',
      storage: '냉장',
      defaultUnit: '단',
    },
  ],
  [
    /과일/,
    {
      normalizedFoodName: '과일',
      category: '과일',
      storage: '냉장',
      defaultUnit: '개',
    },
  ],
];
const nonFoodPattern =
  /키친\s*타월|크리넥스|휴지|섬유\s*탈취제|페브리즈|탈취제|세제|샴푸|린스|화장지|건전지|청소\s*용품|생활\s*용품|위생\s*용품/;

export const isNonFoodProductName = (productName: unknown) =>
  typeof productName === 'string' && nonFoodPattern.test(productName);

const clearFood = (productName: unknown) => {
  if (typeof productName !== 'string' || isNonFoodProductName(productName))
    return null;
  return clearFoods.find(([pattern]) => pattern.test(productName))?.[1] ?? null;
};

const displayName = (productName: string) =>
  productName
    .replace(/\s+\d+(?:\.\d+)?\s*(?:kg|ml|g|L|구|개입|입|팩|봉|병|캔)\s*$/i, '')
    .trim();

const packageDetails = (productName: string, food: ClearFood) => {
  const count = /(\d+(?:\.\d+)?)\s*(구|개입|입|팩|봉|병|캔)(?:\s|$)/.exec(
    productName,
  );
  const weight = /(\d+(?:\.\d+)?)\s*(kg|ml|g|L)(?:\s|$)/i.exec(productName);
  const quantity = count ? Number(count[1]) : 1;
  const countUnit = count?.[2];
  const unit =
    countUnit === '입' || countUnit === '개입'
      ? food.defaultUnit
      : countUnit === '구' && food.normalizedFoodName === '계란'
        ? '개'
        : (countUnit ?? food.defaultUnit);
  const weightPerUnit = weight ? Number(weight[1]) : null;
  const weightUnit = weight
    ? ({ g: 'g', kg: 'kg', ml: 'ml', l: 'L' } as const)[
        weight[2].toLowerCase() as 'g' | 'kg' | 'ml' | 'l'
      ]
    : null;
  return {
    quantity,
    unit,
    weightPerUnit,
    weightUnit,
    totalWeight:
      weightPerUnit === null
        ? null
        : Math.round(weightPerUnit * quantity * 1000) / 1000,
  };
};

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
  const knownFood = clearFood(raw.productName);
  if (knownFood && text(raw.productName, 120)) {
    const details = packageDetails(raw.productName, knownFood);
    raw.name = displayName(raw.productName);
    raw.category = knownFood.category;
    raw.storage = knownFood.storage;
    raw.quantity = details.quantity;
    raw.unit = details.unit;
    meaning.normalizedFoodName = knownFood.normalizedFoodName;
    meaning.weightPerUnit = details.weightPerUnit;
    meaning.weightUnit = details.weightUnit;
    meaning.totalWeight = details.totalWeight;
    meaning.storageCandidates = [knownFood.storage];
    meaning.confidence = 'high';
  }
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
  if (knownFood) {
    resolution.score = Math.max(resolution.score, 0.9);
    resolution.candidates = [];
    if (
      !resolution.evidence.includes(
        '상품명에 식품 종류가 명확히 표시되어 있습니다.',
      )
    )
      resolution.evidence = [
        '상품명에 식품 종류가 명확히 표시되어 있습니다.',
        ...resolution.evidence,
      ].slice(0, MAX_RESOLUTION_EVIDENCE);
  }
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
  const unresolved: PendingProduct[] = [];
  const excluded = (raw.excluded ?? [])
    .map((value) => normalizeNotice(value, 'NON_FOOD'))
    .filter((value): value is ExcludedProduct => value !== null);

  for (const value of [...raw.rows, ...raw.unresolved]) {
    if (isRecord(value) && isNonFoodProductName(value.productName)) {
      const notice = normalizeNotice(value, 'NON_FOOD');
      if (notice) excluded.push(notice as ExcludedProduct);
      continue;
    }
    if (
      isRecord(value) &&
      raw.unresolved.includes(value) &&
      !clearFood(value.productName)
    ) {
      const notice = normalizeNotice(value, 'UNCERTAIN');
      if (notice) unresolved.push(notice);
      continue;
    }
    const rowValue =
      isRecord(value) &&
      !isRecord(value.meaning) &&
      clearFood(value.productName)
        ? {
            ...value,
            name: value.productName,
            quantity: 1,
            unit: '개',
            category: '미분류',
            purchasedAt: suppliedToday,
            storage: '냉장',
            meaning: {
              version: 1,
              normalizedFoodName: value.productName,
              brand: null,
              weightPerUnit: null,
              weightUnit: null,
              totalWeight: null,
              packaging: null,
              storageCandidates: ['냉장'],
              processed: null,
              openingSensitive: null,
              confidence: 'high',
              reasons: [incompleteEvidence],
              confirmed: false,
              resolution: value.resolution,
            },
          }
        : value;
    const normalized = normalizeRow(rowValue, suppliedToday, warnings);
    if (normalized.row) rows.push(normalized.row);
    else if (normalized.pending) unresolved.push(normalized.pending);
  }

  const visibleWarnings = warnings.filter(
    (warning) =>
      !excluded.some((item) => warning.includes(item.productName.trim())),
  );
  return {
    version: 1,
    rows,
    unresolved,
    excluded,
    warnings: visibleWarnings,
  };
}
