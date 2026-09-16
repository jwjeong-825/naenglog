import { daysLeft, type Item, type State } from './domain';
import { isRecord } from './validation';
export type Recipe = {
  id: string;
  title: string;
  summary: string;
  usedInventoryItems: {
    itemId: string;
    name: string;
    quantity: number;
    unit: string;
  }[];
  extraIngredients: { name: string; amount: string }[];
  cookingTimeMinutes: number;
  difficulty: '쉬움' | '보통' | '어려움';
  steps: string[];
  tips: string[];
};
export const recipeSafety =
  '제품 표시와 실제 상태를 확인한 뒤 사용해주세요. 관리기한은 식품 안전을 보장하지 않아요.';
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const text = { type: 'string', minLength: 1, maxLength: 500 };
export const recipeSchema = object({
  recipes: {
    type: 'array',
    minItems: 3,
    maxItems: 5,
    items: object({
      id: { type: 'string', minLength: 1, maxLength: 80 },
      title: text,
      summary: text,
      usedInventoryItems: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: object({
          itemId: text,
          name: text,
          quantity: { type: 'number', minimum: 0.001, maximum: 10000 },
          unit: text,
        }),
      },
      extraIngredients: {
        type: 'array',
        maxItems: 5,
        items: object({ name: text, amount: text }),
      },
      cookingTimeMinutes: { type: 'integer', minimum: 1, maximum: 180 },
      difficulty: { type: 'string', enum: ['쉬움', '보통', '어려움'] },
      steps: { type: 'array', minItems: 2, maxItems: 12, items: text },
      tips: { type: 'array', minItems: 1, maxItems: 5, items: text },
    }),
  },
});
export function selectedIngredients(state: State, ids: unknown): Item[] {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 10 ||
    ids.some((x) => typeof x !== 'string') ||
    new Set(ids).size !== ids.length
  )
    throw new Error('재료를 1~10개 선택해주세요.');
  const items = ids.map((id) => state.items.find((i) => i.id === id));
  if (items.some((i) => !i || i.quantity <= 0 || daysLeft(i.expectedAt) < 0))
    throw new Error(
      '선택한 재료의 재고와 관리기한이 변경됐어요. 냉장고에서 다시 선택해주세요.',
    );
  return items as Item[];
}
export function validateRecipes(
  raw: unknown,
  selected: Item[],
): { recipes: Recipe[] } {
  const fail = () => {
    throw new Error(
      '레시피 결과를 확인하지 못했어요. 재고는 변경하지 않았어요.',
    );
  };
  const str = (v: unknown, max = 500): v is string =>
    typeof v === 'string' && !!v.trim() && v.length <= max;
  if (
    !isRecord(raw) ||
    !Array.isArray(raw.recipes) ||
    raw.recipes.length < 3 ||
    raw.recipes.length > 5
  )
    return fail();
  const ids = new Set();
  const recipes = raw.recipes.map((r) => {
    if (
      !isRecord(r) ||
      !str(r.id, 80) ||
      ids.has(r.id) ||
      !str(r.title, 120) ||
      !str(r.summary) ||
      !Number.isInteger(r.cookingTimeMinutes) ||
      Number(r.cookingTimeMinutes) < 1 ||
      Number(r.cookingTimeMinutes) > 180 ||
      !['쉬움', '보통', '어려움'].includes(String(r.difficulty))
    )
      return fail();
    ids.add(r.id);
    if (
      !Array.isArray(r.usedInventoryItems) ||
      !r.usedInventoryItems.length ||
      r.usedInventoryItems.length > 10 ||
      !Array.isArray(r.extraIngredients) ||
      r.extraIngredients.length > 5
    )
      return fail();
    const used = new Set();
    const usedInventoryItems = r.usedInventoryItems.map((u) => {
      if (!isRecord(u)) return fail();
      const item = selected.find((i) => i.id === u.itemId);
      if (
        !item ||
        used.has(item.id) ||
        u.name !== item.name ||
        u.unit !== item.unit ||
        typeof u.quantity !== 'number' ||
        !Number.isFinite(u.quantity) ||
        u.quantity <= 0 ||
        u.quantity > item.quantity ||
        daysLeft(item.expectedAt) < 0
      )
        return fail();
      used.add(item.id);
      return {
        itemId: item.id,
        name: item.name,
        quantity: u.quantity,
        unit: item.unit,
      };
    });
    const extraIngredients = r.extraIngredients.map((e) => {
      if (!isRecord(e) || !str(e.name, 80) || !str(e.amount, 80)) return fail();
      return { name: e.name, amount: e.amount };
    });
    const lines = (v: unknown, max: number, min: number) => {
      if (
        !Array.isArray(v) ||
        v.length < min ||
        v.length > max ||
        !v.every((x) => str(x))
      )
        return fail();
      return v as string[];
    };
    return {
      id: r.id,
      title: r.title,
      summary: r.summary,
      usedInventoryItems,
      extraIngredients,
      cookingTimeMinutes: Number(r.cookingTimeMinutes),
      difficulty: r.difficulty as Recipe['difficulty'],
      steps: lines(r.steps, 12, 2),
      tips: lines(r.tips, 5, 1),
    };
  });
  return { recipes };
}
export function mockRecipes(items: Item[]) {
  return validateRecipes(
    {
      recipes: ['따뜻한 재료 볶음', '한 냄비 재료 국', '부드러운 재료 찜'].map(
        (title, index) => ({
          id: `mock-recipe-${index}`,
          title,
          summary:
            '화면 흐름 확인용 Mock 예시입니다. 실제 조합과 조리 적합성을 분석하지 않았어요.',
          usedInventoryItems: items.map((i) => ({
            itemId: i.id,
            name: i.name,
            quantity: Math.min(i.quantity, 1),
            unit: i.unit,
          })),
          extraIngredients: [
            {
              name: index === 0 ? '식용유' : '물',
              amount: index === 0 ? '1작은술' : '300ml',
            },
            { name: '소금', amount: '기호에 맞게 소량' },
          ],
          cookingTimeMinutes: 10 + index * 5,
          difficulty: '쉬움',
          steps: [
            recipeSafety,
            '재료를 씻고 조리에 알맞은 크기로 준비하세요.',
            '선택한 조리법에 맞게 충분히 익히고 제품의 조리 지침을 따르세요.',
          ],
          tips: ['Mock 예시이므로 실제 레시피로 검증되지 않았습니다.'],
        }),
      ),
    },
    items,
  );
}
