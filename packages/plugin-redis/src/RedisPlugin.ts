import type { ObserverSDK } from '@observer-os/sdk';
import { patchIoRedis } from './instrumentation/patchIoRedis.js';
import { patchNodeRedis } from './instrumentation/patchNodeRedis.js';

export interface RedisPluginOptions {
  /**
   * Called per-command to retrieve the current request's correlationId.
   * Typically reads from AsyncLocalStorage set by the express middleware.
   */
  getCorrelationId?: () => string | undefined;

  /**
   * Specify the client type explicitly.
   * - 'ioredis'    — use ioredis instrumentation (sendCommand takes a command object)
   * - 'node-redis' — use node-redis instrumentation (sendCommand takes string[])
   * - 'auto'       — detect by inspecting the client (default)
   */
  clientType?: 'ioredis' | 'node-redis' | 'auto';
}

/**
 * Detect whether a client looks like ioredis or node-redis.
 * ioredis Command objects are passed to sendCommand; node-redis passes string[].
 * We distinguish by checking for ioredis-specific properties.
 */
function detectClientType(client: Record<string, unknown>): 'ioredis' | 'node-redis' {
  // ioredis clients have a `options` object with `lazyConnect`, or `connector` property
  if ('connector' in client || ('options' in client && typeof client['options'] === 'object')) {
    return 'ioredis';
  }
  // node-redis v4 has `isReady`, `isOpen` properties
  if ('isReady' in client || 'isOpen' in client) {
    return 'node-redis';
  }
  // Default to ioredis-style
  return 'ioredis';
}

export class RedisPlugin {
  private sdk: ObserverSDK;
  private unpatchers: Array<() => void> = [];

  constructor(sdk: ObserverSDK) {
    this.sdk = sdk;
  }

  /**
   * Instrument a Redis client instance (ioredis or node-redis).
   * Call once per client. Returns `this` for chaining.
   */
  instrument(client: unknown, options: RedisPluginOptions = {}): this {
    const c = client as Record<string, unknown>;
    const { getCorrelationId, clientType = 'auto' } = options;

    const resolvedType =
      clientType === 'auto' ? detectClientType(c) : clientType;

    let unpatch: () => void;
    if (resolvedType === 'ioredis') {
      unpatch = patchIoRedis(client, this.sdk, getCorrelationId);
    } else {
      unpatch = patchNodeRedis(client, this.sdk, getCorrelationId);
    }

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
