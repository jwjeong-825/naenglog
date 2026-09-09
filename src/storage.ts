import { seed, type State } from './domain';
import { assertState } from './validation';
export const STORAGE_KEY = 'naenglog.v1';
export function load(): State {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error(
      '저장 공간을 읽을 수 없어요. 브라우저의 사이트 데이터 설정을 확인한 뒤 다시 시도해주세요.',
    );
  }
  if (raw === null) {
    const state = seed();
    save(state);
    return state;
  }
  try {
    const state: unknown = JSON.parse(raw);
    assertState(state);
    return state;
  } catch {
    throw new Error(
      '저장된 데이터를 읽지 못했어요. 원본을 보존했으니 데이터를 복구한 뒤 다시 시도해주세요.',
    );
  }
}
export function save(state: State) {
  assertState(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error(
      '저장 공간에 접근하지 못했어요. 브라우저 설정이나 여유 공간을 확인해주세요. 변경은 적용되지 않았어요.',
    );
  }
}
