import {
  createAIService,
  AIServiceError,
  type AnalyzeInput,
  type ProviderMode,
} from './ai-service';
import { validateAnalysis } from './analysis';
import type { State } from './domain';
import { isRecord } from './validation';
let mode: ProviderMode = 'mock';
async function call(operation: string, payload: object, signal?: AbortSignal) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, ...payload }),
  });
  const body = await response.json();
  if (!isRecord(body)) throw new Error('Invalid AI response');
  if (!response.ok)
    throw new AIServiceError(
      body.code === 'invalid_response' ||
        body.code === 'timeout' ||
        body.code === 'cancelled'
        ? body.code
        : 'unavailable',
      typeof body.error === 'string'
        ? body.error
        : '분석 서버에 연결하지 못했어요.',
    );
  if (
    body.mode !== 'mock' &&
    body.mode !== 'fallback' &&
    body.mode !== 'remote'
  )
    throw new Error('Invalid provider mode');
  mode = body.mode;
  return body.result;
}
const transport = createAIService(
  {
    mode: 'remote',
    analyze: (input, o) => call('analyze', { input }, o.signal),
    interpret: (text, _state, o) => call('interpret', { text }, o.signal),
    briefing: (_state, o) => call('briefing', {}, o.signal),
  },
  35000,
);
export const ai = {
  get mode() {
    return mode;
  },
  config: async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      await call('config', {}, controller.signal);
    } finally {
      clearTimeout(timer);
    }
    return mode;
  },
  analyze: async (input: AnalyzeInput, signal?: AbortSignal) =>
    validateAnalysis(await transport.analyzeDetailed(input, signal)),
  interpret: (text: string, state: State, signal?: AbortSignal) =>
    transport.interpret(text, state, signal),
  briefing: (state: State, signal?: AbortSignal) =>
    transport.briefing(state, signal),
};
