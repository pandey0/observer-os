import { AsyncLocalStorage } from 'node:async_hooks';

interface PropagationContext {
  correlationId: string;
  sessionId?: string;
}

const storage = new AsyncLocalStorage<PropagationContext>();

/**
 * Run fn inside a propagation context.
 * Any code called within fn (including async continuations) can read the
 * correlationId via getCurrentCorrelationId() — no manual threading needed.
 *
 * Typical use: Express middleware wraps each request:
 *   runWithCorrelation(requestId, () => next())
 */
export function runWithCorrelation<T>(correlationId: string, fn: () => T, sessionId?: string): T {
  return storage.run({ correlationId, sessionId }, fn);
}

/** Returns the correlationId of the currently-active propagation context, or undefined. */
export function getCurrentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/** Returns the sessionId from the propagation context (set by daemon plugins). */
export function getCurrentSessionId(): string | undefined {
  return storage.getStore()?.sessionId;
}

/** True when a propagation context is active on the current async call chain. */
export function hasPropagationContext(): boolean {
  return storage.getStore() !== undefined;
}
