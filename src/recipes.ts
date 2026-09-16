import type { Item } from './domain';
export type Recipe = { id: string; name: string; minutes: number; ingredients: string[]; steps: string[]; reason: string };
const recipes: Recipe[] = [
  { id: 'egg-rice', name: '달걀 볶음밥', minutes: 15, ingredients: ['계란', '즉석밥', '양파', '대파', '간장'], steps: ['재료를 먹기 좋은 크기로 손질해요.', '팬에 양파와 대파를 볶아요.', '계란과 밥을 넣고 고루 볶아요.', '간장으로 간을 맞춰 마무리해요.'], reason: '보유 재료를 한 번에 활용하기 좋아요.' },
  { id: 'tofu-kimchi', name: '두부 김치볶음', minutes: 20, ingredients: ['두부', '김치', '대파', '간장'], steps: ['두부를 데쳐 물기를 빼요.', '김치와 대파를 볶아요.', '간장으로 간을 맞춰 두부와 곁들여요.'], reason: '두부와 김치를 빠르게 소비할 수 있어요.' },
  { id: 'chicken-mushroom', name: '닭가슴살 버섯볶음', minutes: 20, ingredients: ['닭가슴살', '버섯', '양파', '간장'], steps: ['닭가슴살과 채소를 손질해요.', '닭가슴살을 속까지 익혀요.', '채소와 간장을 넣고 함께 볶아요.'], reason: '관리기한이 짧은 단백질과 채소를 함께 써요.' },
  { id: 'ramen-egg', name: '계란 대파 라면', minutes: 10, ingredients: ['라면', '계란', '대파'], steps: ['물을 끓이고 면과 수프를 넣어요.', '계란과 대파를 넣어요.', '면이 익으면 바로 담아요.'], reason: '적은 재료로 빠르게 만들 수 있어요.' },
];
const normalized = (item: Item) => item.meaning?.normalizedFoodName || item.name;
export function recommendRecipes(items: Item[]) {
  const owned = new Set(items.filter((i) => i.quantity > 0).map(normalized));
  return recipes.map((recipe) => ({ ...recipe, available: recipe.ingredients.filter((x) => owned.has(x)), missing: recipe.ingredients.filter((x) => !owned.has(x)) })).filter((r) => r.available.length).sort((a, b) => b.available.length - a.available.length || a.missing.length - b.missing.length);
}
