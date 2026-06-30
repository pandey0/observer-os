import type { Pool } from 'pg';
import type { ObserverSDK } from '@observer-os/sdk';
import { patchPool } from './instrumentation/patchPool.js';

export interface PostgresPluginOptions {
  /**
   * Called per-query to retrieve the current request's correlationId.
   * Typically reads from AsyncLocalStorage set by the express middleware.
   * When provided, query nodes become CORRELATED_WITH request nodes.
   */
  getCorrelationId?: () => string | undefined;
}

export class PostgresPlugin {
  private sdk: ObserverSDK;
  private opts: PostgresPluginOptions;
  private unpatchers: Array<() => void> = [];

  constructor(sdk: ObserverSDK, opts: PostgresPluginOptions = {}) {
    this.sdk = sdk;
    this.opts = opts;
  }

  /**
   * Instrument a pg Pool instance.
   * Call once per Pool. Returns `this` for chaining.
   */
  instrument(pool: Pool): this {
    const unpatch = patchPool(pool, this.sdk, this.opts.getCorrelationId);
    this.unpatchers.push(unpatch);
    return this;
  }

  /**
   * Remove all patches applied by this plugin instance.
   */
  dispose(): void {
    for (const fn of this.unpatchers) fn();
    this.unpatchers = [];
  }
}
