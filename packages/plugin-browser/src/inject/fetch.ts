import { emit } from './emitter.js';
import { generateW3CTraceId, generateW3CSpanId, generateNodeId, TRACE_HEADER, TRACEPARENT_HEADER } from './correlation.js';
import { BROWSER_EVENTS } from './event-types.js';

export function patchFetch(): void {
  if (typeof window === 'undefined' || !window.fetch) return;

  const original = window.fetch.bind(window);

  window.fetch = async function observerFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const traceId = generateW3CTraceId();
    const spanId = generateW3CSpanId();
    const url = resolveUrl(input);
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const nodeId = generateNodeId('browser', `fetch:${traceId}`);
    const startedAt = Date.now();

    // Inject W3C traceparent AND legacy x-observer-trace-id for backward compat
    const headers = new Headers(init.headers ?? {});
    headers.set(TRACEPARENT_HEADER, `00-${traceId}-${spanId}-01`);
    headers.set(TRACE_HEADER, traceId);

    emit({
      type: BROWSER_EVENTS.FETCH_STARTED,
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      correlationId: traceId,
      payload: {
        method,
        url,
        hasBody: init.body != null,
      },
    });

    let response: Response;
    try {
      response = await original(input, { ...init, headers });
    } catch (err) {
      emit({
        type: BROWSER_EVENTS.FETCH_FAILED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId: traceId,
        severity: 'ERROR',
        payload: {
          method,
          url,
          error: String(err),
          duration: Date.now() - startedAt,
        },
      });
      throw err;
    }

    emit({
      type: BROWSER_EVENTS.FETCH_COMPLETED,
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      correlationId: traceId,
      severity: response.ok ? 'INFO' : 'WARN',
      payload: {
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        duration: Date.now() - startedAt,
        contentType: response.headers.get('content-type') ?? null,
      },
    });

    return response;
  };
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}
