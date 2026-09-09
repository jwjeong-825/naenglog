import { foods, id, ranked, today, type State } from './domain';
import { createAIService, type AIProvider } from './ai-service';
// TODO: replace only this provider after explicit authorization. See AI_PROVIDER_SETUP.md.
export const mockProvider: AIProvider = {
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
      return { message: buildMockBriefing(state).message };
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
    const rest = value
      .slice(value.indexOf(item.name) + item.name.length)
      .trim()
      .replace(/^[을를]\s*/, '');
    const move = rest.match(
      /^(?:(냉장|냉동|실온)에서\s*)?(냉장|냉동|실온)(?:으로|로|에)\s*(?:옮겼어|옮겨줘|바꿔줘|보관해줘|변경해줘)[.!]?$/,
    );
    if (move) {
      if (move[1] && move[1] !== item.storage)
        throw new Error(
          '현재 보관 장소와 요청이 달라요. 상세 화면에서 확인해주세요.',
        );
      return { ...base, action: 'storage_change', storage: move[2] };
    }
    const consume = rest.match(
      /^(다|전부|모두|하나|한\s*개|\d+(?:\.\d+)?\s*[a-zA-Z가-힣]+)\s*(썼어|사용했어|먹었어|마셨어|마셨 어|버렸어|버려줘|폐기했어)[.!]?$/,
    );
    if (!consume)
      throw new Error(
        '한 번에 한 가지 행동을 알려주세요. 예: 계란 3개 썼어 / 우유 다 마셨어',
      );
    const token = consume[1],
      dispose = /버|폐기/.test(consume[2]);
    let quantity: number;
    if (['다', '전부', '모두'].includes(token)) quantity = item.quantity;
    else if (/하나|한\s*개/.test(token)) {
      if (!['개', '팩', '봉', '병', '통'].includes(item.unit))
        throw new Error(`이 재료는 ${item.unit} 단위로 알려주세요.`);
      quantity = 1;
    } else {
      const count = token.match(/^(\d+(?:\.\d+)?)\s*(.+)$/)!;
      if (count[2] !== item.unit)
        throw new Error(
          `이 재료는 ${item.unit} 단위로 관리해요. 단위를 맞춰주세요.`,
        );
      quantity = Number(count[1]);
    }
    return { ...base, action: dispose ? 'dispose' : 'consume', quantity };
  },
  async briefing(state) {
    return buildMockBriefing(state);
  },
};
export const ai = createAIService(mockProvider);
export function buildMockBriefing(state: State) {
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
}
