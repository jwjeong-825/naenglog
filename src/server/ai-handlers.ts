import { createAIService, AIServiceError } from '../ai-service';
import { isRecord } from '../validation';
import { validateImage } from '../image-input';
import { readToken, sessionHash } from './handlers';
import {
  selectProvider,
  providerTimeout,
  type AIEnvironment,
} from './ai-provider';
import type { InventoryRepository } from './repository';
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' },
  });
export function createAIHandler(
  repository: InventoryRepository,
  env: AIEnvironment,
) {
  return async (request: Request) => {
    if (request.headers.get('Origin') !== new URL(request.url).origin)
      return reply({ error: '이 사이트에서 다시 요청해주세요.' }, 403);
    const token = readToken(request);
    if (!token) return reply({ error: '냉장고를 먼저 열어주세요.' }, 401);
    if (!request.headers.get('Content-Type')?.startsWith('application/json'))
      return reply({ error: 'JSON 요청이 필요해요.' }, 415);
    const limit = 7 * 1024 * 1024;
    if (Number(request.headers.get('Content-Length')) > limit)
      return reply({ error: '이미지는 5MB 이하여야 해요.' }, 413);
    let body: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw new Error();
      let length = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) {
          await reader.cancel();
          return reply({ error: '요청이 너무 커요.' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (
        !isRecord(body) ||
        !['analyze', 'interpret', 'briefing', 'config'].includes(
          String(body.operation),
        )
      )
        throw new Error();
    } catch {
      return reply({ error: '분석 요청을 읽지 못했어요.' }, 400);
    }
    try {
      const snapshot = await repository.find(await sessionHash(token));
      if (!snapshot) return reply({ error: '냉장고를 다시 열어주세요.' }, 401);
      const provider = selectProvider(env);
      const service = createAIService(provider, providerTimeout(env));
      if (body.operation === 'config')
        return reply({ mode: provider.mode, result: {} });
      let result: unknown;
      if (body.operation === 'analyze') {
        if (
          !isRecord(body.input) ||
          !['직접 입력', '영수증', '온라인 캡처'].includes(
            String(body.input.source),
          )
        )
          return reply({ error: '입력 출처를 확인해주세요.' }, 400);
        const input = body.input;
        if (input.source === '직접 입력') {
          if (
            typeof input.text !== 'string' ||
            !input.text.trim() ||
            input.text.length > 12000
          )
            return reply(
              { error: '상품 입력은 12000자 이내로 작성해주세요.' },
              400,
            );
          result = await service.analyzeDetailed(
            { source: input.source, text: input.text },
            request.signal,
          );
        } else {
          try {
            validateImage(input.image);
          } catch (e) {
            return reply({ error: (e as Error).message }, 400);
          }
          result = await service.analyzeDetailed(
            { source: String(input.source), image: input.image },
            request.signal,
          );
        }
      } else if (body.operation === 'interpret') {
        if (
          typeof body.text !== 'string' ||
          !body.text.trim() ||
          body.text.length > 2000
        )
          return reply({ error: '요청을 2000자 이내로 입력해주세요.' }, 400);
        result = await service.interpret(
          body.text,
          snapshot.state,
          request.signal,
        );
      } else result = await service.briefing(snapshot.state, request.signal);
      return reply({ mode: provider.mode, result });
    } catch (e) {
      return reply(
        {
          error:
            e instanceof AIServiceError
              ? e.message
              : 'AI 설정 또는 응답을 확인하지 못했어요. 직접 입력하거나 다시 시도해주세요.',
          code: e instanceof AIServiceError ? e.code : 'unavailable',
        },
        503,
      );
    }
  };
}
