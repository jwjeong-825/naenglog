import type { Command, Draft, State } from './domain';
import { assertState, isRecord } from './validation';
export type Snapshot = { state: State; revision: number; notice?: string };
export type Mutation =
  | { kind: 'command'; command: Command }
  | { kind: 'purchase'; rows: Draft[]; batchId: string; source: string }
  | { kind: 'reset' };
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request(body?: unknown): Promise<Snapshot> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const result = await fetch('/api/inventory', {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const raw: unknown = await result.json();
    if (result.status === 401 && typeof window !== 'undefined')
      window.dispatchEvent(new Event('naenglog-auth-required'));
    if (!result.ok)
      throw new ApiError(
        result.status,
        isRecord(raw) && typeof raw.error === 'string'
          ? raw.error
          : '저장 서버에 연결하지 못했어요.',
      );
    if (
      !isRecord(raw) ||
      !Number.isSafeInteger(raw.revision) ||
      Number(raw.revision) < 0
    )
      throw new Error('Invalid response');
    assertState(raw.state);
    return { state: raw.state, revision: Number(raw.revision) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      '서버 응답을 확인하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요. 저장 요청 후라면 최신 상태부터 확인해주세요.',
    );
  } finally {
    clearTimeout(timer);
  }
}
// Legacy browser data is never silently attached to a newly authenticated account.
export async function loadRemote(): Promise<Snapshot> {
  return request();
}
export const mutateRemote = (mutation: Mutation, revision: number) =>
  request({ ...mutation, revision });
