import { tryRequire } from '../detect';
import type { EventQueue } from '../queue';
import { correlationStorage } from '../context';

const registeredPools = new WeakSet<object>();

interface Mysql2Module {
  createPool?: (config: unknown) => unknown;
  createConnection?: (config: unknown) => unknown;
  Pool?: { prototype: Record<string, unknown> };
  Connection?: { prototype: Record<string, unknown> };
}

function getNodeId(instance: Record<string, unknown>): string {
  // mysql2 stores config at pool.pool.config or connection.config
  const cfg =
    (instance['config'] as Record<string, unknown>) ??
    ((instance['pool'] as Record<string, unknown>)?.['config'] as Record<string, unknown>) ??
    {};
  const poolCfg = (cfg['connectionConfig'] as Record<string, unknown>) ?? cfg;
  const host = String(poolCfg['host'] ?? 'localhost');
  const port = String(poolCfg['port'] ?? 3306);
  const database = String(poolCfg['database'] ?? 'unknown');
  return `mysql:pool:${host}:${port}/${database}`;
}

function redactParams(params: unknown[]): unknown[] {
  return params.map((v) => {
    if (v === null || v === undefined) return v;
    const s = String(v);
    if (s.length > 60 || s.startsWith('$2')) return '[redacted]';
    return v;
  });
}

function wrapMethod(
  proto: Record<string, unknown>,
  method: 'query' | 'execute',
  queue: EventQueue,
): void {
  const orig = proto[method] as ((...args: unknown[]) => unknown) | undefined;
  if (typeof orig !== 'function') return;

  proto[method] = function patchedMethod(this: Record<string, unknown>, ...args: unknown[]) {
    const nodeId = getNodeId(this);

    if (!registeredPools.has(this)) {
      registeredPools.add(this);
      const cfg =
        (this['config'] as Record<string, unknown>) ??
        ((this['pool'] as Record<string, unknown>)?.['config'] as Record<string, unknown>) ??
        {};
      const poolCfg = (cfg['connectionConfig'] as Record<string, unknown>) ?? cfg;
      queue.push({
        type: 'observer.mysql/pool.connected',
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        severity: 'INFO',
        payload: {
          host: poolCfg['host'] ?? 'localhost',
          port: poolCfg['port'] ?? 3306,
          database: poolCfg['database'] ?? 'unknown',
        },
      });
    }

    // mysql2 query(sql) | query(sql, values) | query(options) | query(options, values)
    const sqlArg = args[0];
    const queryText =
      typeof sqlArg === 'string'
        ? sqlArg
        : (sqlArg as { sql?: string })?.sql ?? 'unknown';

    const rawParams =
      Array.isArray(args[1])
        ? args[1]
        : (sqlArg as { values?: unknown[] })?.values;
    const params = rawParams ? redactParams(rawParams as unknown[]) : undefined;

    const correlationId = correlationStorage.getStore();
    const startedAt = Date.now();

    queue.push({
      type: 'observer.mysql/query.started',
      sourceNodeId: nodeId,
      correlationId,
      occurredAt: startedAt,
      severity: 'DEBUG',
      payload: { query: queryText.slice(0, 400), params, method },
    });

    const result = orig.apply(this, args);

    // mysql2/promise returns a Promise; callback form returns void
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>)
        .then((r) => {
          queue.push({
            type: 'observer.mysql/query.completed',
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
            type: 'observer.mysql/query.failed',
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

export function patchMysql(queue: EventQueue): boolean {
  // mysql2/promise is the async interface; mysql2 exports sync-callback form too
  const mysql2 = (tryRequire('mysql2/promise') ?? tryRequire('mysql2')) as Mysql2Module | null;
  if (!mysql2) return false;

  // Patch Pool prototype — covers pool.query() and pool.execute()
  if (mysql2.Pool?.prototype) {
    wrapMethod(mysql2.Pool.prototype as Record<string, unknown>, 'query', queue);
    wrapMethod(mysql2.Pool.prototype as Record<string, unknown>, 'execute', queue);
  }

  // Patch Connection prototype — for direct connections (not pooled)
  if (mysql2.Connection?.prototype) {
    wrapMethod(mysql2.Connection.prototype as Record<string, unknown>, 'query', queue);
    wrapMethod(mysql2.Connection.prototype as Record<string, unknown>, 'execute', queue);
  }

  return !!(mysql2.Pool?.prototype || mysql2.Connection?.prototype);
}
