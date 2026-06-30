import type { ObserverSDK } from '@observer-os/sdk';
import { patchFetch } from './fetchWrapper.js';

/**
 * Install Observer instrumentation from a Next.js `instrumentation.ts` file.
 *
 * Usage in your `instrumentation.ts`:
 * ```ts
 * import { registerObserver } from '@observer-os/plugin-nextjs/instrumentation/register';
 *
 * export async function register() {
 *   // Only run on the server (Node.js runtime)
 *   if (process.env.NEXT_RUNTIME === 'nodejs') {
 *     const sdk = // ... create or retrieve your ObserverSDK instance
 *     registerObserver(sdk);
 *   }
 * }
 * ```
 *
 * Returns an unregister function — call it to remove all instrumentation.
 */
export function registerObserver(sdk: ObserverSDK): () => void {
  const unpatches: Array<() => void> = [];

  // Patch fetch — must run after Next.js has had a chance to patch it first
  unpatches.push(patchFetch(sdk));

  return () => {
    for (const unpatch of unpatches) unpatch();
    unpatches.length = 0;
  };
}
