import { validateAnalysis, type AnalysisResult } from './analysis';
import type { ImageInput } from './image-input';
import type { Command, Draft, State } from './domain';
import { assertCommand, isRecord } from './validation';
export type ProviderMode = 'mock' | 'fallback' | 'remote';
export type Briefing = { title: string; message: string; menu: string };
export type Interpretation = Command | { message: string };
export type AnalyzeInput = {
  source: string;
  image?: ImageInput;
  text?: string;
  recognition?: { text: string; purchasedAt?: string; assetId?: string };
};
export type RequestOptions = {
  signal: AbortSignal;
  limits?: {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxImages: number;
    maxImageBytes: number;
    maxRetries: number;
    maxCalls: number;
  };
  /** Server adapter only: total billable tokens including vision/reasoning. */
  reportUsage?: (usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  }) => void;
};
/** Provider implementations return untrusted data. No remote implementation is enabled. */
export interface AIProvider {
  readonly mode: ProviderMode;
  analyze(input: AnalyzeInput, options: RequestOptions): Promise<unknown>;
  interpret(
    text: string,
    state: State,
    options: RequestOptions,
  ): Promise<unknown>;
  briefing(state: State, options: RequestOptions): Promise<unknown>;
}
export class AIServiceError extends Error {
  constructor(
    public readonly code:
      | 'trial_limit'
      | 'invalid_response'
      | 'timeout'
      | 'cancelled'
      | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}
function decode(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AIServiceError(
      'invalid_response',
      '분석 결과 형식이 올바르지 않아요. 다시 시도하거나 직접 입력해주세요.',
    );
  }
}
export function createAIService(provider: AIProvider, timeoutMs = 5000) {
  async function request<T>(
    work: (options: RequestOptions) => Promise<unknown>,
    validate: (raw: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted)
      throw new AIServiceError('cancelled', '요청이 취소되었어요.');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: () => void = () => {};
    const cancel = new Promise<never>((_, reject) => {
      abortHandler = () => {
        controller.abort();
        reject(new AIServiceError('cancelled', '요청이 취소되었어요.'));
      };
      if (signal?.aborted) abortHandler();
      else signal?.addEventListener('abort', abortHandler, { once: true });
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new AIServiceError(
            'timeout',
            '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
          ),
        );
      }, timeoutMs);
    });
    try {
      if (signal?.aborted)
        throw new AIServiceError('cancelled', '요청이 취소되었어요.');
      const raw = await Promise.race([
        Promise.resolve().then(() => work({ signal: controller.signal })),
        timeout,
        cancel,
      ]);
      return validate(decode(raw));
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError(
        'unavailable',
        provider.mode === 'mock' && error instanceof Error
          ? error.message
          : '분석을 완료하지 못했어요. 다시 시도하거나 직접 입력해주세요.',
      );
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', abortHandler);
    }
  }
  const invalid = () =>
    new AIServiceError(
      'invalid_response',
      '분석 결과를 확인하지 못했어요. 재고는 변경하지 않았으니 다시 시도해주세요.',
    );
  return {
    mode: provider.mode,
    analyzeDetailed: (input: AnalyzeInput, signal?: AbortSignal) =>
      request<AnalysisResult>(
        (o) => provider.analyze(input, o),
        (raw) => {
          try {
            return validateAnalysis(raw);
          } catch {
            throw invalid();
          }
        },
        signal,
      ),
    analyze: (input: AnalyzeInput, signal?: AbortSignal) =>
      request<Draft[]>(
        (o) => provider.analyze(input, o),
        (raw) => {
          try {
            const result = validateAnalysis(raw);
            if (!result.rows.length) throw invalid();
            return result.rows;
          } catch {
            throw invalid();
          }
        },
        signal,
      ),
    interpret: (text: string, state: State, signal?: AbortSignal) =>
      request<Interpretation>(
        (o) => provider.interpret(text, structuredClone(state), o),
        (raw) => {
          if (
            isRecord(raw) &&
            typeof raw.message === 'string' &&
            raw.message.trim() &&
            raw.message.length <= 1500 &&
            Object.keys(raw).length === 1
          )
            return { message: raw.message };
          try {
            assertCommand(raw);
            if (!state.items.some((i) => i.id === raw.itemId && i.quantity > 0))
              throw invalid();
            return structuredClone(raw);
          } catch {
            throw invalid();
          }
        },
        signal,
      ),
    briefing: (state: State, signal?: AbortSignal) =>
      request<Briefing>(
        (o) => provider.briefing(structuredClone(state), o),
        (raw) => {
          if (
            !isRecord(raw) ||
            typeof raw.title !== 'string' ||
            !raw.title.trim() ||
            raw.title.length > 120 ||
            typeof raw.message !== 'string' ||
            !raw.message.trim() ||
            raw.message.length > 1500 ||
            typeof raw.menu !== 'string' ||
            raw.menu.length > 120
          )
            throw invalid();
          return { title: raw.title, message: raw.message, menu: raw.menu };
        },
        signal,
      ),
  };
}
