import { apply, purchase, seed, type State } from '../domain';
import {
  assertState,
  assertCommand,
  assertDraft,
  isRecord,
} from '../validation';
export type Snapshot = { state: State; revision: number };
export class InventoryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface Database {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
}
export class InventoryRepository {
  constructor(private db: Database) {}
  async find(session: string): Promise<Snapshot | null> {
    const row = await this.db
      .prepare(
        'SELECT snapshot, revision FROM inventories WHERE session_hash = ?',
      )
      .bind(session)
      .first<{ snapshot: string; revision: number }>();
    if (!row) return null;
    const state: unknown = JSON.parse(row.snapshot);
    assertState(state);
    return { state, revision: row.revision };
  }
  async create(session: string): Promise<Snapshot> {
    const state = seed(),
      at = new Date().toISOString();
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO inventories (session_hash, snapshot, revision, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
      )
      .bind(session, JSON.stringify(state), at, at)
      .run();
    const result = await this.find(session);
    if (!result) throw new Error('Database initialization failed');
    return result;
  }
  async change(session: string, request: unknown): Promise<Snapshot> {
    if (
      !isRecord(request) ||
      !Number.isSafeInteger(request.revision) ||
      Number(request.revision) < 0
    )
      throw new InventoryError(400, '변경 요청 형식이 올바르지 않아요.');
    const current = await this.find(session);
    if (!current)
      throw new InventoryError(
        401,
        '냉장고 연결이 만료되었어요. 새로고침해주세요.',
      );
    // A replay is successful only for an operation already committed for this session.
    if (
      request.kind === 'command' &&
      isRecord(request.command) &&
      current.state.applied.includes(String(request.command.id))
    )
      return current;
    if (
      request.kind === 'purchase' &&
      typeof request.batchId === 'string' &&
      current.state.purchases.some((p) => p.id === request.batchId)
    )
      return current;
    if (current.revision !== request.revision)
      throw new InventoryError(
        409,
        '다른 화면에서 냉장고가 변경됐어요. 최신 상태를 확인한 뒤 다시 적용해주세요.',
      );
    let next: State;
    if (request.kind === 'command') {
      assertCommand(request.command);
      next = apply(current.state, request.command);
    } else if (request.kind === 'purchase') {
      if (
        !Array.isArray(request.rows) ||
        request.rows.length < 1 ||
        request.rows.length > 50 ||
        typeof request.batchId !== 'string' ||
        request.batchId.length < 1 ||
        request.batchId.length > 120 ||
        !['직접 입력', '영수증', '온라인 캡처'].includes(String(request.source))
      )
        throw new InventoryError(400, '구매내역을 다시 확인해주세요.');
      request.rows.forEach(assertDraft);
      next = purchase(
        current.state,
        request.rows,
        request.batchId,
        String(request.source),
      );
    } else if (request.kind === 'reset') next = seed();
    else if (request.kind === 'import') {
      if (current.revision !== 0)
        throw new InventoryError(
          409,
          '이미 서버에 저장된 냉장고가 있어요. 가져오기로 덮어쓰지 않았어요.',
        );
      assertState(request.state);
      next = request.state;
    } else throw new InventoryError(400, '지원하지 않는 변경 요청이에요.');
    assertState(next);
    const result = await this.db
      .prepare(
        'UPDATE inventories SET snapshot = ?, revision = revision + 1, updated_at = ? WHERE session_hash = ? AND revision = ?',
      )
      .bind(
        JSON.stringify(next),
        new Date().toISOString(),
        session,
        current.revision,
      )
      .run();
    if (result.meta.changes !== 1)
      throw new InventoryError(
        409,
        '다른 화면에서 먼저 수정했어요. 최신 상태를 다시 확인해주세요.',
      );
    return { state: next, revision: current.revision + 1 };
  }
}
