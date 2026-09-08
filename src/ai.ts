import {
  foods,
  id,
  ranked,
  today,
  type State,
  type Draft,
  type Command,
} from './domain';
export interface AIProvider {
  readonly mode: 'mock';
  analyze(input: { source: string; text?: string }): Promise<Draft[]>;
  interpret(text: string, state: State): Promise<Command | { message: string }>;
  briefing(state: State): { title: string; message: string; menu: string };
}
// TODO: replace only this provider after explicit authorization. See AI_PROVIDER_SETUP.md.
export const ai: AIProvider = {
  mode: 'mock',
  async analyze({ source, text }) {
    await new Promise((r) => setTimeout(r, 650));
    const lines =
      source === '직접 입력'
        ? (text ?? '').split(/\n/).filter((l) => l.trim())
        : ['닭가슴살 2개', '버섯 1팩', '계란 10개', '우유 1개'];
    if (!lines.length)
      throw new Error('식재료를 한 줄에 하나씩 입력해주세요. 예: 계란 10개');
    return lines.map((line) => {
      const m = line.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([^\d\s]+)$/);
      if (!m)
        throw new Error(
          `“${line.slice(0, 30)}”의 수량과 단위를 확인해주세요. 예: 우유 2개`,
        );
      const name =
        Object.keys(foods).find((n) => m[1].includes(n)) ?? m[1].trim();
      return {
        name,
        productName: m[1].trim(),
        quantity: Number(m[2]),
        unit: m[3],
        category: foods[name]?.category ?? '미분류',
        storage: foods[name]?.storage ?? '냉장',
        purchasedAt: today(),
      };
    });
  },
  async interpret(text, state) {
    const value = text.trim();
    if (/안\s|않|말고|취소|아니/.test(value))
      throw new Error(
        '부정하거나 여러 행동을 섞은 요청은 적용하지 않아요. 원하는 변경만 다시 알려주세요.',
      );
    if (/뭐부터|먼저|추천|뭐.*먹/.test(value))
      return { message: this.briefing(state).message };
    const candidates = state.items.filter(
      (i) => i.quantity > 0 && value.includes(i.name),
    );
    if (candidates.length !== 1)
      throw new Error(
        candidates.length
          ? '같은 이름 또는 여러 재료가 있어요. 냉장고에서 하나를 선택해주세요.'
          : '식재료를 찾지 못했어요. 이름과 수량을 함께 입력해주세요.',
      );
    const item = candidates[0];
    const base = { id: id(), itemId: item.id };
    if (/냉동|냉장|실온/.test(value) && /바꿔|옮|보관|변경/.test(value))
      return {
        ...base,
        action: 'storage_change',
        storage: value.includes('냉동')
          ? '냉동'
          : value.includes('실온')
            ? '실온'
            : '냉장',
      };
    const dispose = /버렸|버려|폐기/.test(value);
    if (!dispose && !/썼|사용|먹었|먹어|마셨|마셨어/.test(value))
      throw new Error('요청을 이해하지 못했어요. 예: 계란 3개 썼어');
    const m = value.match(/(\d+(?:\.\d+)?)\s*([^\s\d]+)?/);
    const all = /다\s|전부|모두/.test(value);
    const quantity = all
      ? item.quantity
      : m
        ? Number(m[1])
        : /하나|한\s*개/.test(value)
          ? 1
          : undefined;
    if (quantity === undefined)
      throw new Error(
        '얼마나 사용했는지 알려주세요. 전부라면 “다”를 넣어주세요.',
      );
    if (m?.[2] && !m[2].startsWith(item.unit))
      throw new Error(
        `이 재료는 ${item.unit} 단위로 관리해요. 단위를 맞춰주세요.`,
      );
    return { ...base, action: dispose ? 'dispose' : 'consume', quantity };
  },
  briefing(state) {
    const items = ranked(state);
    const safe = items.filter((i) => i.days >= 0);
    const first = safe[0];
    if (!first)
      return {
        title: items.length ? '사용 전에 상태를 확인하세요' : '가벼워진 냉장고',
        message: items.length
          ? '예상 시점이 지난 재료가 있어요. 섭취를 추천하지 않아요.'
          : '구매내역을 추가하면 오늘의 우선순위를 안내할게요.',
        menu: '',
      };
    return {
      title: `오늘은 ${first.name}부터`,
      message: `${first.name}을 먼저 살펴보세요. ${first.reason}. ${safe[1] ? `${safe[1].name}도 함께 확인하면 좋아요.` : ''}`,
      menu:
        safe.some((i) => i.name === '버섯') &&
        safe.some((i) => i.name === '닭가슴살')
          ? '닭가슴살 버섯볶음'
          : `${first.name}을 활용한 한 끼`,
    };
  },
};
