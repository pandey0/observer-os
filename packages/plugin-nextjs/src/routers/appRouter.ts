import type { ObserverSDK } from '@observer-os/sdk';
import { runWithNextCorrelation } from '../instrumentation/alsContext.js';
import { NEXTJS_EVENTS } from '../node-types.js';

let appReqSeq = 0;

/**
 * Wrap an App Router request handler (e.g. a route handler or page component)
 * to emit Observer events and propagate the correlation ID.
 *
 * Typically called from a `register()` hook that intercepts incoming requests:
 * ```ts
 * // instrumentation.ts
 * export function register() {
 *   withAppRouterObserver(() => handleRequest(), sdk, { correlationId: req.headers.get('x-observer-trace-id') ?? undefined });
 * }
 * ```
 */
export async function withAppRouterObserver<T>(
  handler: () => Promise<T>,
  sdk: ObserverSDK,
  options: { correlationId?: string } = {},
): Promise<T> {
  const { correlationId } = options;
  const nodeId = sdk.generateNodeId(`app-request:${++appReqSeq}`);
  const startedAt = Date.now();

  sdk.emit({
    type: NEXTJS_EVENTS.APP_REQUEST_STARTED,
    sourceNodeId: nodeId,
    occurredAt: startedAt,
    correlationId,
    payload: {},
  });

  return runWithNextCorrelation(correlationId ?? (nodeId as string), async () => {
    try {
      const result = await handler();

      sdk.emit({
        type: NEXTJS_EVENTS.APP_REQUEST_COMPLETED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        payload: { duration: Date.now() - startedAt },
      });

      return result;
    } catch (err: unknown) {
      sdk.emit({
        type: NEXTJS_EVENTS.APP_REQUEST_FAILED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity: 'ERROR',
        payload: {
          error: err instanceof Error ? err.message : String(err),
          duration: Date.now() - startedAt,
        },
      });
      throw err;
    }
  });
}
