import type { ObserverSDK } from '@observer-os/sdk';
import { getNextCorrelationId } from './alsContext.js';
import { NEXTJS_EVENTS } from '../node-types.js';

let fetchSeq = 0;

/**
 * Patch `globalThis.fetch` to emit Observer fetch events.
 *
 * Wraps whatever `globalThis.fetch` is at call time so it is safe to call
 * after Next.js has already patched fetch (e.g. for its own cache behaviour).
 *
 * Returns an unpatch function — call it to restore the previous fetch.
 */
export function patchFetch(sdk: ObserverSDK): () => void {
  // Capture the current fetch (may already be Next.js-patched)
  const g = globalThis as Record<string, unknown>;
  const originalFetch = g['fetch'] as (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => Promise<Response>;

  g['fetch'] = async function observerFetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> {
    const correlationId = getNextCorrelationId();

    // Derive a readable URL string from whatever input type is given
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    const method = init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).method : 'GET');
    const nodeId = sdk.generateNodeId(`fetch:${++fetchSeq}`);
    const startedAt = Date.now();

    sdk.emit({
      type: NEXTJS_EVENTS.FETCH_STARTED,
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      correlationId,
      payload: { url, method },
    });

    try {
      const response = await originalFetch(input, init);

      sdk.emit({
        type: NEXTJS_EVENTS.FETCH_COMPLETED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        payload: {
          url,
          method,
          status: response.status,
          duration: Date.now() - startedAt,
        },
      });

      return response;
    } catch (err: unknown) {
      sdk.emit({
        type: NEXTJS_EVENTS.FETCH_FAILED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity: 'ERROR',
        payload: {
          url,
          method,
          error: err instanceof Error ? err.message : String(err),
          duration: Date.now() - startedAt,
        },
      });
      throw err;
    }
  };

  return () => {
    g['fetch'] = originalFetch;
  };
}
