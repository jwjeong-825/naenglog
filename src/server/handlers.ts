import { InventoryRepository, InventoryError } from './repository';
const cookieName = 'naenglog_session';
const headers = {
  'Cache-Control': 'no-store, private',
  Vary: 'Cookie',
  'Content-Type': 'application/json; charset=utf-8',
};
function response(body: unknown, status = 200, cookie?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
}
export async function sessionHash(token: string) {
  const data = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(data), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function readToken(request: Request) {
  const token = request.headers
    .get('Cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function createInventoryHandlers(repository: InventoryRepository) {
  return {
    async GET(request: Request) {
      try {
        let token = readToken(request);
        let cookie: string | undefined;
        if (!token) {
          token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
            b.toString(16).padStart(2, '0'),
          ).join('');
          cookie = `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
        }
        const key = await sessionHash(token);
        const current = await repository.find(key);
        return response(current ?? (await repository.create(key)), 200, cookie);
      } catch {
        return response(
          { error: '냉장고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.' },
          503,
        );
      }
    },
    async POST(request: Request) {
      const origin = request.headers.get('Origin');
      if (!origin || origin !== new URL(request.url).origin)
        return response({ error: '이 사이트에서 다시 요청해주세요.' }, 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/json'))
        return response({ error: '올바른 형식으로 요청해주세요.' }, 415);
      const token = readToken(request);
      if (!token) return response({ error: '냉장고를 다시 열어주세요.' }, 401);
      if (Number(request.headers.get('Content-Length')) > 1024 * 1024)
        return response(
          { error: '한 번에 가져올 수 있는 데이터 크기를 넘었어요.' },
          413,
        );
      let body: unknown;
      try {
        const reader = request.body?.getReader();
        if (!reader)
          return response({ error: '변경 내용을 입력해주세요.' }, 400);
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) {
            await reader.cancel();
            return response({ error: '데이터 크기를 줄여주세요.' }, 413);
          }
          chunks.push(value);
        }
        const buffer = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.byteLength;
        }
        body = JSON.parse(new TextDecoder().decode(buffer));
      } catch {
        return response({ error: '변경 내용을 읽지 못했어요.' }, 400);
      }
      try {
        return response(
          await repository.change(await sessionHash(token), body),
        );
      } catch (error) {
        if (error instanceof InventoryError)
          return response({ error: error.message }, error.status);
        return response(
          {
            error:
              '변경을 저장하지 못했어요. 수량과 요청 내용을 확인한 뒤 다시 시도해주세요.',
          },
          400,
        );
      }
    },
  };
}
