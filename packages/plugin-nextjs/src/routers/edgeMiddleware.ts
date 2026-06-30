import type { ObserverSDK } from '@observer-os/sdk';
import { NEXTJS_EVENTS } from '../node-types.js';

let middlewareSeq = 0;

/**
 * Higher-order function that wraps a Next.js Edge Middleware function to
 * emit Observer lifecycle events.
 *
 * Usage in `middleware.ts`:
 * ```ts
 * import { withObserverMiddleware } from '@observer-os/plugin-nextjs';
 *
 * const myMiddleware = (req: NextRequest) => NextResponse.next();
 * export const middleware = withObserverMiddleware(myMiddleware, sdk);
 * ```
 */
export function withObserverMiddleware(
  middleware: (req: unknown) => unknown,
  sdk: ObserverSDK,
): (req: unknown) => unknown {
  return async (req: unknown): Promise<unknown> => {
    const nodeId = sdk.generateNodeId(`middleware:${++middlewareSeq}`);
    const startedAt = Date.now();

    sdk.emit({
      type: NEXTJS_EVENTS.MIDDLEWARE_INVOKED,
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      payload: {},
    });

    try {
      const result = await Promise.resolve(middleware(req));

      sdk.emit({
        type: NEXTJS_EVENTS.MIDDLEWARE_COMPLETED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        payload: { duration: Date.now() - startedAt },
      });

      return result;
    } catch (err: unknown) {
      throw err;
    }
  };
}
