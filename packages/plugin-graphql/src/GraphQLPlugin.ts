import type { ObserverSDK } from '@observer-os/sdk';
import { wrapExecute } from './instrumentation/wrapExecute.js';
import type { ExecuteFn, GraphQLPluginOptions } from './instrumentation/wrapExecute.js';

export { GraphQLPluginOptions };

export class GraphQLPlugin {
  private wrappedExecute: ExecuteFn | null = null;

  constructor(private readonly sdk: ObserverSDK) {}

  instrument(execute: ExecuteFn, options?: GraphQLPluginOptions): ExecuteFn {
    this.wrappedExecute = wrapExecute(execute, this.sdk, options);
    return this.wrappedExecute;
  }

  dispose(): void {
    this.wrappedExecute = null;
  }
}
