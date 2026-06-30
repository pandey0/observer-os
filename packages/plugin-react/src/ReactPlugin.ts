import type { ObserverSDK } from '@observer-os/sdk';
import { installDevToolsHook } from './instrumentation/DevToolsHook.js';

export interface ReactPluginOptions {
  /** Custom global object to install hook on. Defaults to globalThis/window. */
  globalObj?: Window & typeof globalThis;
}

export class ReactPlugin {
  private readonly sdk: ObserverSDK;
  private uninstall: (() => void) | null = null;

  constructor(sdk: ObserverSDK) {
    this.sdk = sdk;
  }

  /** Install the React DevTools hook. Call before React mounts. */
  instrument(options: ReactPluginOptions = {}): this {
    if (this.uninstall) return this;
    this.uninstall = installDevToolsHook(this.sdk, options.globalObj);
    return this;
  }

  dispose(): void {
    this.uninstall?.();
    this.uninstall = null;
  }
}
