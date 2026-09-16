import { InventoryRepository, InventoryError, type Database } from './repository';
import { requireUser } from './auth-session';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie', 'Content-Type': 'application/json; charset=utf-8' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function validSameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}

export function createInventoryHandlers(repository: InventoryRepository, db?: Database) {
  return {
    async GET(request: Request) {
      if (!db) return response({ error: '인증 구성이 필요해요.' }, 503);
      const user = await requireUser(request, db);
      if (!user) return response({ error: '로그인이 필요해요.' }, 401);
      try {
        return response((await repository.find(user.id)) ?? (await repository.create(user.id)));
      } catch {
        return response({ error: '냉장고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.' }, 503);
      }
    },
    async POST(request: Request) {
      if (!validSameOrigin(request)) return response({ error: '이 사이트에서 다시 요청해주세요.' }, 403);
      if (!db) return response({ error: '인증 구성이 필요해요.' }, 503);
      const user = await requireUser(request, db);
      if (!user) return response({ error: '로그인이 필요해요.' }, 401);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return response({ error: '올바른 형식으로 요청해주세요.' }, 415);
      if (Number(request.headers.get('Content-Length')) > 1024 * 1024) return response({ error: '한 번에 가져올 수 있는 데이터 크기를 넘었어요.' }, 413);
      let body: unknown;
      try { body = await request.json(); } catch { return response({ error: '변경 내용을 읽지 못했어요.' }, 400); }
      try { return response(await repository.change(user.id, body)); }
      catch (error) {
        if (error instanceof InventoryError) return response({ error: error.message }, error.status);
        return response({ error: '변경을 저장하지 못했어요. 수량과 요청 내용을 확인해주세요.' }, 400);
      }
    },
  };
}
