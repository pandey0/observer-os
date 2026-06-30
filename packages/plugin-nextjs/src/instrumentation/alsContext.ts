import { AsyncLocalStorage } from 'node:async_hooks';

interface NextContext {
  correlationId: string;
}

/**
 * Singleton AsyncLocalStorage for propagating correlation IDs through the
 * Next.js request lifecycle (including async boundaries and server components).
 */
const storage = new AsyncLocalStorage<NextContext>();

/**
 * Run `fn` inside a Next.js propagation context carrying the given `id`.
 * Any code called within `fn` — including awaited async work — can retrieve
 * the id via `getNextCorrelationId()`.
 */
export function runWithNextCorrelation<T>(id: string, fn: () => T): T {
  return storage.run({ correlationId: id }, fn);
}

/**
 * Returns the correlationId of the currently-active Next.js propagation
 * context, or `undefined` if none is set.
 */
export function getNextCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
