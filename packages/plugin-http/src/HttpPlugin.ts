import type { ObserverSDK } from '@observer-os/sdk';
import { patchHttp } from './instrumentation/patchHttp.js';
import type { HttpPluginOptions } from './instrumentation/patchHttp.js';

export { HttpPluginOptions };

export class HttpPlugin {
  private unpatch: (() => void) | null = null;

  constructor(private readonly sdk: ObserverSDK) {}

  instrument(options?: HttpPluginOptions): this {
    if (this.unpatch) return this;
    this.unpatch = patchHttp(this.sdk, options);
    return this;
  }

  dispose(): void {
    this.unpatch?.();
    this.unpatch = null;
  }
}
