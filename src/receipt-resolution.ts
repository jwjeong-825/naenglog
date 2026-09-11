import { interpretProduct } from './product';
import { foods, type Draft } from './domain';
export const CONFIDENCE_THRESHOLDS = { high: 0.9, review: 0.7 } as const;
export type Resolution = {
  classification: 'FOOD' | 'NON_FOOD' | 'UNCERTAIN';
  score: number;
  method:
    | 'local_rule'
    | 'mock_catalog'
    | 'direct_ai'
    | 'ai_search'
    | 'user_confirmed';
  evidence: string[];
  candidates: string[];
};
export type PendingProduct = {
  productName: string;
  reason: string;
  resolution?: Resolution;
};
export type ExcludedProduct = {
  productName: string;
  reason: string;
  resolution: Resolution;
};
export interface ProductExplorer {
  readonly method?: 'mock_catalog' | 'ai_search';
  resolve(
    query: { originalText: string; normalizedText: string },
    options: { signal: AbortSignal; maxCandidates: number },
  ): Promise<unknown>;
}
export const normalizeReceiptText = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/(?:₩\s*[\d,]+|[\d,]+\s*원)(?=\s|$)/g, ' ')
    .replace(/[^\p{L}\p{N}\s.%/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function assertResolution(value: unknown): asserts value is Resolution {
  const v = value as Resolution;
  if (
    !v ||
    !['FOOD', 'NON_FOOD', 'UNCERTAIN'].includes(v.classification) ||
    typeof v.score !== 'number' ||
    !Number.isFinite(v.score) ||
    v.score < 0 ||
    v.score > 1 ||
    ![
      'local_rule',
      'mock_catalog',
      'direct_ai',
      'ai_search',
      'user_confirmed',
    ].includes(v.method) ||
    !Array.isArray(v.evidence) ||
    !v.evidence.length ||
    v.evidence.length > 5 ||
    !v.evidence.every(
      (x) => typeof x === 'string' && x.trim() && x.length <= 300,
    ) ||
    !Array.isArray(v.candidates) ||
    v.candidates.length > 3 ||
    !v.candidates.every(
      (x) => typeof x === 'string' && x.trim() && x.length <= 60,
    ) ||
    Object.keys(v).some(
      (k) =>
        ![
          'classification',
          'score',
          'method',
          'evidence',
          'candidates',
        ].includes(k),
    )
  )
    throw new Error('상품 탐색 결과를 확인하지 못했어요.');
}
const aliases: Record<string, string> = {
  비비고왕: '만두',
  '비비고 왕교자': '만두',
  농심신: '라면',
  대패삼겹살: '돼지고기',
  맛김: '김',
  PB우유: '우유',
};
const examples: Record<string, string[]> = {
  서울1000: ['우유', '두유', '요구르트'],
  참P500: ['참치', '참기름', '참깨'],
  청정2호: ['선물세트'],
  비비고왕: ['만두'],
  농심신: ['라면'],
};
export const mockExplorer: ProductExplorer = {
  async resolve({ normalizedText }) {
    return examples[normalizedText.replace(/\s/g, '')] ?? [];
  },
};
function classification(text: string): Resolution {
  const food =
    Object.keys(foods).some((n) => text.includes(n)) ||
    /샐러드|밀키트|삼겹살|돼지고기|왕교자|만두|맛김|라면|^김\s/.test(text);
  const nonFood = /휴지|샴푸|세제|건전지/.test(text);
  const status =
    food && !nonFood ? 'FOOD' : nonFood && !food ? 'NON_FOOD' : 'UNCERTAIN';
  return {
    classification: status,
    score: status === 'UNCERTAIN' ? 0.2 : 0.65,
    method: 'local_rule',
    evidence: [
      status === 'NON_FOOD'
        ? '생활용품 표현을 찾았어요. 제외 목록을 확인해주세요.'
        : '로컬 규칙의 데모 분류입니다. 실측 AI 확률이 아니에요.',
    ],
    candidates: [],
  };
}
export function confirmCandidate(
  productName: string,
  name: string,
  quantity: number,
  unit: string,
): Draft {
  const draft = interpretProduct(name + ' ' + quantity + unit);
  return {
    ...draft,
    productName,
    meaning: {
      ...draft.meaning!,
      confirmed: false,
      resolution: {
        classification: 'FOOD',
        score: 0,
        method: 'user_confirmed',
        evidence: [
          '사용자가 식품 이름과 수량을 입력했어요. 최종 등록 전 내용을 확인해주세요.',
        ],
        candidates: [],
      },
    },
  };
}
export async function resolveReceipt(
  lines: string[],
  signal: AbortSignal,
  explorer: ProductExplorer = mockExplorer,
) {
  const rows: Draft[] = [],
    unresolved: PendingProduct[] = [],
    excluded: ExcludedProduct[] = [];
  let lookups = 0;
  if (lines.length > 50)
    throw new Error('구매 품목은 한 번에 50개까지 정리할 수 있어요.');
  for (const original of lines) {
    if (signal.aborted) throw new Error('요청이 취소되었어요.');
    const productName = original.trim();
    if (!productName) continue;
    if (productName.length > 120) {
      unresolved.push({
        productName: productName.slice(0, 120),
        reason: '상품명이 너무 길어요. 짧게 수정해주세요.',
      });
      continue;
    }
    const clean = normalizeReceiptText(productName);
    let resolution = classification(clean);
    if (resolution.classification === 'NON_FOOD') {
      excluded.push({
        productName,
        reason: '비식품으로 분류하여 등록에서 제외했어요.',
        resolution,
      });
      continue;
    }
    if (resolution.classification === 'UNCERTAIN') {
      let reason =
        '상품을 확정할 근거가 부족해요. 식품 이름과 수량을 확인해주세요.';
      if (lookups++ < 3) {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal.addEventListener('abort', cancel, { once: true });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const found = await Promise.race([
            explorer.resolve(
              { originalText: productName, normalizedText: clean },
              { signal: controller.signal, maxCandidates: 3 },
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error('timeout'));
              }, 1500);
              controller.signal.addEventListener(
                'abort',
                () => reject(new Error('cancelled')),
                { once: true },
              );
            }),
          ]);
          if (
            !Array.isArray(found) ||
            found.length > 3 ||
            !found.every(
              (x) => typeof x === 'string' && x.trim() && x.length <= 60,
            )
          )
            throw new Error('Invalid candidates');
          resolution = {
            ...resolution,
            method: explorer.method ?? 'mock_catalog',
            candidates: found,
            evidence: [
              explorer.method === 'ai_search'
                ? '상품 검색 후보입니다. 원본 상품과 일치하는지 확인해주세요.'
                : '로컬 예시 카탈로그를 탐색했어요. 실제 웹 검색 결과가 아니며 정답으로 확정하지 않아요.',
            ],
          };
        } catch {
          if (signal.aborted) throw new Error('요청이 취소되었어요.');
          reason =
            '상품 후보를 찾지 못했어요. 직접 확인하거나 이 품목을 제외해주세요.';
        } finally {
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
        }
      } else
        reason =
          '한 번에 후보 탐색은 3품목까지예요. 이 품목은 직접 확인해주세요.';
      unresolved.push({ productName, reason, resolution });
      continue;
    }
    try {
      let text = clean;
      for (const [alias, name] of Object.entries(aliases))
        if (text.includes(alias)) {
          text = text.replace(alias, name);
          break;
        }
      const draft = interpretProduct(text);
      const brand = /^(하림|서울우유|풀무원|비비고|농심|청정원)/.exec(
        clean,
      )?.[1];
      if (brand) draft.meaning!.brand = brand;
      if (
        ![
          '개',
          '팩',
          '봉',
          '봉지',
          '병',
          '통',
          '박스',
          '상자',
          '캔',
          '입',
          'g',
          'kg',
          'ml',
          'L',
          '마리',
          '모',
          '단',
        ].includes(draft.unit)
      )
        throw new Error('Unknown quantity unit');
      rows.push({
        ...draft,
        productName,
        meaning: { ...draft.meaning!, resolution },
      });
    } catch {
      unresolved.push({
        productName,
        reason:
          '수량·단위를 확인해주세요. 가격 숫자를 수량으로 확정하지 않았어요.',
        resolution,
      });
    }
  }
  return {
    version: 1 as const,
    rows,
    unresolved,
    excluded,
    warnings: [] as string[],
  };
}
