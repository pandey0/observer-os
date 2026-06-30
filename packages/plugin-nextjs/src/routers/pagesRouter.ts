import type { ObserverSDK } from '@observer-os/sdk';
import { runWithNextCorrelation } from '../instrumentation/alsContext.js';
import { NEXTJS_EVENTS } from '../node-types.js';

const TRACE_HEADER = 'x-observer-trace-id';

let handlerSeq = 0;

// Minimal shape we read from the GSSP/GSP context to extract the trace header
interface ContextWithReq {
  req?: {
    headers?: Record<string, string | string[] | undefined>;
  };
}

/**
 * Higher-order function that wraps a `getServerSideProps` or
 * `getStaticProps` handler to emit Observer lifecycle events and propagate
 * the request's correlation ID into the ALS context.
 *
 * Usage:
 * ```ts
 * export const getServerSideProps = withObserver(
 *   async (context) => { ... },
 *   sdk,
 *   'gssp'
 * );
 * ```
 */
export function withObserver<T>(
  handler: (context: unknown) => Promise<T>,
  sdk: ObserverSDK,
  eventType: 'gssp' | 'gsp',
): (context: unknown) => Promise<T> {
  return async (context: unknown): Promise<T> => {
    const started = eventType === 'gssp' ? NEXTJS_EVENTS.GSSP_STARTED : NEXTJS_EVENTS.GSP_STARTED;
    const completed = eventType === 'gssp' ? NEXTJS_EVENTS.GSSP_COMPLETED : NEXTJS_EVENTS.GSP_COMPLETED;

    // Extract optional correlation ID propagated via request header
    const ctx = context as ContextWithReq;
    const rawHeader = ctx.req?.headers?.[TRACE_HEADER];
    const correlationId = typeof rawHeader === 'string' ? rawHeader : undefined;

    const nodeId = sdk.generateNodeId(`${eventType}:${++handlerSeq}`);
    const startedAt = Date.now();

    sdk.emit({
      type: started,
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      correlationId,
      payload: { eventType },
    });

    return runWithNextCorrelation(correlationId ?? (nodeId as string), async () => {
      try {
        const result = await handler(context);

        sdk.emit({
          type: completed,
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          correlationId,
          payload: { eventType, duration: Date.now() - startedAt },
        });

        return result;
      } catch (err: unknown) {
        // Re-throw without emitting a specific failed event — the caller
        // (Next.js) will surface the error. Callers can add their own
        // error handling around the wrapped result if needed.
        throw err;
      }
    });
  };
}
