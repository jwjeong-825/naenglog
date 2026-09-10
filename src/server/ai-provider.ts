import { mockProvider } from '../ai';
import type { AIProvider } from '../ai-service';
import type { BudgetEnvironment } from './ai-budget';
export type AIEnvironment = BudgetEnvironment & {
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_API_KEY?: string;
  AI_TIMEOUT_MS?: string;
};
/** Server-only composition root. No external request or SDK is implemented. */
export function selectProvider(env: AIEnvironment): AIProvider {
  if (!env.AI_PROVIDER || env.AI_PROVIDER === 'mock') return mockProvider;
  throw new Error('Remote provider is not implemented');
}
export function providerTimeout(env: AIEnvironment) {
  const ms = Number(env.AI_TIMEOUT_MS ?? 15000);
  if (!Number.isInteger(ms) || ms < 1000 || ms > 30000)
    throw new Error('Invalid timeout');
  return ms;
}
