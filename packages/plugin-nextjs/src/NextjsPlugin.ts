import type {
  ObserverSDK,
  DiscoveryResult,
  Workspace,
  SessionInfo,
  PluginConfig,
  HealthStatus,
} from '@observer-os/sdk';
import type { NodeTypeRegistration } from '@observer-os/core';
import { patchFetch } from './instrumentation/fetchWrapper.js';
import { withObserver } from './routers/pagesRouter.js';
import { withObserverMiddleware } from './routers/edgeMiddleware.js';

/**
 * Observer OS plugin for Next.js.
 *
 * Instruments:
 * - `globalThis.fetch` (via `connect`)
 * - `getServerSideProps` / `getStaticProps` (via `withObserver`)
 * - Edge Middleware (via `withObserverMiddleware`)
 *
 * Users who need App Router instrumentation should call `registerObserver`
 * from their `instrumentation.ts` `register()` function instead.
 */
export class NextjsPlugin {
  readonly id = 'observer.nextjs';
  readonly name = 'Next.js Observer';
  readonly version = '0.1.0';
  readonly sdkVersion = '0.1.0';
  readonly runtimeType = 'NODEJS' as const;

  private unpatches: Array<() => void> = [];

  async discover(_workspace: Workspace): Promise<DiscoveryResult> {
    try {
      await import('next');
      return { detected: true, confidence: 0.9 };
    } catch {
      return { detected: false, confidence: 0 };
    }
  }

  async connect(_session: SessionInfo, sdk: ObserverSDK, _config?: PluginConfig): Promise<void> {
    // Patch globalThis.fetch to emit fetch lifecycle events
    const unpatch = patchFetch(sdk);
    this.unpatches.push(unpatch);
    sdk.log('info', 'Next.js observer connected — fetch instrumentation active');
  }

  async disconnect(): Promise<void> {
    this.unpatches.forEach(u => u());
    this.unpatches = [];
  }

  async onHealthCheck(): Promise<HealthStatus> {
    return {
      healthy: this.unpatches.length > 0,
      message: this.unpatches.length > 0 ? 'Fetch instrumentation active' : 'Not connected',
    };
  }

  getNodeTypes(): NodeTypeRegistration[] {
    return [];
  }

  // ─── HOF helpers exposed so users don't need to import sub-paths ────────────

  /**
   * Wrap a `getServerSideProps` or `getStaticProps` handler.
   * @see pagesRouter.withObserver
   */
  withObserver = withObserver;

  /**
   * Wrap a Next.js Edge Middleware function.
   * @see edgeMiddleware.withObserverMiddleware
   */
  withObserverMiddleware = withObserverMiddleware;
}
