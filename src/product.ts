import type { Resolution } from './receipt-resolution';
import { foods, today, type Draft, type Storage } from './domain';
export type ProductMeaning = {
  version: 1;
  resolution?: Resolution;
  normalizedFoodName: string;
  brand: string | null;
  weightPerUnit: number | null;
  weightUnit: 'g' | 'kg' | 'ml' | 'L' | null;
  totalWeight: number | null;
  packaging: string | null;
  storageCandidates: Storage[];
  processed: boolean | null;
  openingSensitive: boolean | null;
  confidence: 'high' | 'low';
  reasons: string[];
  confirmed: boolean;
};
/** Deterministic demonstration of semantic interpretation, never image recognition. */
export function interpretProduct(line: string): Draft {
  const productName = line.trim();
  const m = productName.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([^\d\s]+)$/);
  if (!m)
    throw new Error('상품명 뒤에 수량과 단위를 적어주세요. 예: 계란 10개');
  const quantity = Number(m[2]);
  const composite = /샐러드|도시락|밀키트|볶음밥|샌드위치/.test(m[1]);
  const weight = m[1].match(/(\d+(?:\.\d+)?)\s*(kg|ml|g|L)\b/i);
  const brand = /^(하림|서울우유|풀무원)\s/.exec(m[1])?.[1] ?? null;
  const stripped = m[1]
    .replace(/(\d+(?:\.\d+)?)\s*(kg|ml|g|L)\b/gi, '')
    .replace(/^(하림|서울우유|풀무원)\s/, '')
    .trim();
  const name = composite
    ? stripped
    : (Object.keys(foods).find((n) => m[1].includes(n)) ?? stripped);
  const weightUnit = weight
    ? ({ g: 'g', kg: 'kg', ml: 'ml', l: 'L' } as const)[
        weight[2].toLowerCase() as 'g' | 'kg' | 'ml' | 'l'
      ]
    : null;
  const weightPerUnit = weight ? Number(weight[1]) : null;
  const catalog: Record<string, { category: string; storage: Storage }> = {
    만두: { category: '냉동식품', storage: '냉동' },
    돼지고기: { category: '육류', storage: '냉장' },
    김: { category: '가공식품', storage: '실온' },
    라면: { category: '가공식품', storage: '실온' },
  };
  const storage = foods[name]?.storage ?? catalog[name]?.storage ?? '냉장';
  const processed =
    composite ||
    ['만두', '김', '라면'].includes(name) ||
    /블랙페퍼|훈제|소시지/.test(stripped)
      ? true
      : null;
  return {
    name,
    productName,
    quantity,
    unit: m[3],
    category: composite
      ? '완제품'
      : (foods[name]?.category ?? catalog[name]?.category ?? '미분류'),
    purchasedAt: today(),
    storage,
    meaning: {
      version: 1,
      normalizedFoodName: name,
      brand,
      weightPerUnit,
      weightUnit,
      totalWeight:
        weightPerUnit === null
          ? null
          : Math.round(weightPerUnit * quantity * 1000) / 1000,
      packaging: m[3],
      storageCandidates: ['닭가슴살', '돼지고기'].includes(name)
        ? ['냉장', '냉동']
        : [storage],
      processed,
      openingSensitive: processed ? true : null,
      confidence: 'low',
      confirmed: false,
      reasons: [
        composite
          ? '완제품 한 단위로 관리하며 구성 재료를 임의로 분해하지 않았어요.'
          : '상품명에서 관리할 식재료와 포장 수량을 구분했어요.',
        '규칙 기반 예시입니다. 구매일은 오늘로 제안했으며 보관·개봉 조건은 제품 표시를 확인해주세요.',
      ],
    },
  };
}
