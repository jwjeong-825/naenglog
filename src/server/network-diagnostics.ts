/** Fixed categories only: never return exception messages, stacks or arbitrary codes. */
export function classifyNetworkError(error: unknown) {
  const e = error as { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
  const rawCode = e?.cause?.code ?? e?.code;
  const code = typeof rawCode === 'string' ? rawCode : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  if (/ENOTFOUND|EAI_AGAIN|EAI_FAIL/.test(code) || /dns|resolve host|name resolution/i.test(message)) return 'dns_failure';
  if (/CERT|TLS|SSL/.test(code) || /certificate|tls handshake|ssl/i.test(message)) return 'tls_failure';
  if (code === 'ECONNREFUSED' || /connection refused/i.test(message)) return 'connection_refused';
  if (/ECONNRESET|EPIPE/.test(code) || /connection reset|connection lost/i.test(message)) return 'connection_reset';
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/.test(code)) return 'connection_timeout';
  if (/redirect/i.test(message)) return 'redirect_rejected';
  if (/header|invalid url|invalid request/i.test(message)) return 'request_construction';
  if (/not allowed|not supported|unsupported|disallowed|egress|blocked|illegal invocation/i.test(message)) return 'runtime_restriction';
  return 'generic_network_failure';
}

// Fixed public HEAD requests only. No inference endpoint, credentials, request body,
// forwarded user headers or caller-controlled target. Per-isolate reuse limits probing.
let cached: Promise<unknown> | undefined;
export function networkProbe(fetcher: typeof fetch = fetch) {
  cached ??= Promise.all([
    ['general_https', 'https://example.com/', 'manual'],
    ['openai_https', 'https://api.openai.com/', 'manual'],
    ['openai_unsupported_redirect_mode', 'https://api.openai.com/', 'error'],
    ['openai_unauthenticated_models', 'https://api.openai.com/v1/models', 'manual'],
  ].map(async ([target, url, redirect]) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const start = Date.now();
    try {
      const response = await fetcher(url, {method:target === 'openai_unauthenticated_models' ? 'GET' : 'HEAD', redirect:redirect as RequestRedirect, signal:controller.signal});
      await response.body?.cancel();
      return {target,httpStatus:response.status,category:null,elapsedMs:Date.now()-start};
    } catch (error) {
      return {target,httpStatus:null,category:controller.signal.aborted?'probe_timeout':classifyNetworkError(error),elapsedMs:Date.now()-start};
    } finally {clearTimeout(timer);}
  }));
  return cached;
}
