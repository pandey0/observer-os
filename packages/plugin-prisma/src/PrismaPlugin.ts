import type { ObserverSDK } from '@observer-os/sdk';
import { createObserverExtension } from './instrumentation/observerExtension.js';
import type { PrismaPluginOptions } from './instrumentation/observerExtension.js';

export { PrismaPluginOptions };

export class PrismaPlugin {
  constructor(private readonly sdk: ObserverSDK) {}

  extension(options?: PrismaPluginOptions) {
    return createObserverExtension(this.sdk, options);
  }

  dispose(): void {
    // stateless — nothing to clean up
  }
}
