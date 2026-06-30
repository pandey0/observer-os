import { tryRequire } from '../detect';
import type { EventQueue } from '../queue';
import { correlationStorage } from '../context';

const registeredPools = new WeakSet<object>();

export function patchPostgres(queue: EventQueue): boolean {
  const pg = tryRequire('pg') as {
    Pool?: { prototype: { query: (...a: unknown[]) => unknown; options?: Record<string, unknown> } };
    Client?: { prototype: { query: (...a: unknown[]) => unknown; connectionParameters?: Record<string, unknown> } };
  } | null;
  if (!pg) return false;

  function getNodeId(instance: { options?: Record<string, unknown>; connectionParameters?: Record<string, unknown> }, label: string): string {
    const opts = instance.options ?? instance.connectionParameters ?? {};
    const host = String(opts['host'] ?? 'localhost');
    const port = String(opts['port'] ?? 5432);
    const database = String(opts['database'] ?? opts['db'] ?? 'unknown');
    return `postgres:${label}:${host}:${port}/${database}`;
  }

  function wrapQuery(
    proto: { query: (...a: unknown[]) => unknown; options?: Record<string, unknown>; connectionParameters?: Record<string, unknown> },
    label: string,
  ): void {
    const origQuery = proto.query;
    proto.query = function observerQuery(this: typeof proto, ...args: unknown[]) {
      const nodeId = getNodeId(this, label);

      // Emit infrastructure node once per pool/client instance
      if (!registeredPools.has(this as object)) {
        registeredPools.add(this as object);
        const opts = this.options ?? this.connectionParameters ?? {};
        queue.push({
          type: 'observer.postgres/pool.connected',
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: 'INFO',
          payload: {
            host: opts['host'] ?? 'localhost',
            port: opts['port'] ?? 5432,
            database: opts['database'] ?? opts['db'] ?? 'unknown',
          },
        });
      }

      const queryArg = args[0];
      const queryText =
        typeof queryArg === 'string'
          ? queryArg
          : (queryArg as { text?: string })?.text ?? 'unknown';
      // Capture bound parameters — truncate long values, redact sensitive-looking keys
      const rawParams =
        Array.isArray(args[1])
          ? args[1]
          : (queryArg as { values?: unknown[] })?.values;
      const params = rawParams
        ? (rawParams as unknown[]).map((v) => {
            if (v === null || v === undefined) return v;
            const s = String(v);
            // Redact anything that looks like a password hash or long token
            if (s.length > 60 || s.startsWith('$2')) return '[redacted]';
            return v;
          })
        : undefined;
      const correlationId = correlationStorage.getStore();
      const startedAt = Date.now();

      queue.push({
        type: 'observer.postgres/query.started',
        sourceNodeId: nodeId,
        correlationId,
        occurredAt: startedAt,
        severity: 'DEBUG',
        payload: { query: queryText.slice(0, 400), params },
      });

      const result = origQuery.apply(this as object, args) as Promise<unknown>;
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>)
          .then((r) => {
            queue.push({
              type: 'observer.postgres/query.completed',
              sourceNodeId: nodeId,
              correlationId,
              occurredAt: Date.now(),
              severity: 'DEBUG',
              payload: { query: queryText.slice(0, 200), durationMs: Date.now() - startedAt },
            });
            return r;
          })
          .catch((err: Error) => {
            queue.push({
              type: 'observer.postgres/query.failed',
              sourceNodeId: nodeId,
              correlationId,
              occurredAt: Date.now(),
              severity: 'ERROR',
              payload: { query: queryText.slice(0, 200), errorMessage: err.message, durationMs: Date.now() - startedAt },
            });
            throw err;
          });
      }
      return result;
    };
  }

  // Only patch Pool — Pool.query internally calls Client.query, so patching both doubles every event.
  if (pg.Pool?.prototype) wrapQuery(pg.Pool.prototype as typeof pg.Pool.prototype & { options?: Record<string, unknown> }, 'pool');
  return true;
}
