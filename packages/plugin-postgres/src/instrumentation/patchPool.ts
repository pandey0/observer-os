import type { Pool, PoolClient, QueryConfig } from 'pg';
import type { ObserverSDK } from '@observer-os/sdk';
import { getCurrentCorrelationId } from '@observer-os/sdk';
import { asNodeId } from '@observer-os/core';
import { POSTGRES_EVENTS } from '../node-types.js';

export type QueryInput = string | QueryConfig;

let connSeq = 0;
let querySeq = 0;
let txSeq = 0;

function nodeId(prefix: string, n: number) {
  return asNodeId(`${prefix}_${n}`);
}

function sanitizeQuery(q: QueryInput): string {
  if (typeof q === 'string') return q.slice(0, 500);
  return (q.text ?? '').slice(0, 500);
}

function queryValues(q: QueryInput): unknown[] | undefined {
  if (typeof q === 'string') return undefined;
  return q.values as unknown[] | undefined;
}

/**
 * Patch a pg Pool instance to emit Observer events.
 * Returns an unpatch function.
 *
 * Usage:
 *   const unwatch = patchPool(pool, sdk, correlationId);
 *
 * correlationId: pass the request's correlationId (from express middleware)
 * to form CORRELATED_WITH edges between HTTP requests and DB queries.
 */
export function patchPool(
  pool: Pool,
  sdk: ObserverSDK,
  getCorrelationId?: () => string | undefined
): () => void {
  const originalQuery = pool.query.bind(pool) as typeof pool.query;
  const originalConnect = pool.connect.bind(pool);

  // Patch pool.query (non-transactional queries)
  (pool as unknown as Record<string, unknown>).query = async function observedQuery(
    ...args: Parameters<typeof pool.query>
  ) {
    const qId = nodeId('pg_query', ++querySeq);
    const qInput = args[0] as QueryInput;
    const corrId = getCorrelationId?.() ?? getCurrentCorrelationId();

    sdk.emit({
      type: POSTGRES_EVENTS.QUERY_STARTED,
      sourceNodeId: qId,
      occurredAt: Date.now(),
      payload: {
        sql: sanitizeQuery(qInput),
        values: queryValues(qInput),
        paramCount: queryValues(qInput)?.length ?? 0,
      },
      correlationId: corrId,
      severity: 'DEBUG',
    });

    const t0 = Date.now();
    try {
      const result = await (originalQuery as (...a: unknown[]) => Promise<unknown>)(...args);
      const r = result as { rowCount?: number };
      sdk.emit({
        type: POSTGRES_EVENTS.QUERY_COMPLETED,
        sourceNodeId: qId,
        occurredAt: Date.now(),
        payload: {
          rowCount: r.rowCount ?? 0,
          durationMs: Date.now() - t0,
        },
        correlationId: corrId,
        severity: 'DEBUG',
      });
      return result;
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      sdk.emit({
        type: POSTGRES_EVENTS.QUERY_FAILED,
        sourceNodeId: qId,
        occurredAt: Date.now(),
        payload: {
          errorName: e.name,
          errorMessage: e.message,
          errorCode: (e as unknown as Record<string, unknown>)['code'],
          durationMs: Date.now() - t0,
        },
        correlationId: corrId,
        severity: 'ERROR',
      });
      throw err;
    }
  };

  // Patch pool.connect to instrument per-client transactions
  (pool as unknown as Record<string, unknown>).connect = async function observedConnect() {
    const connId = nodeId('pg_conn', ++connSeq);
    const corrId = getCorrelationId?.() ?? getCurrentCorrelationId();

    sdk.emit({
      type: POSTGRES_EVENTS.CONNECTION_ACQUIRED,
      sourceNodeId: connId,
      occurredAt: Date.now(),
      payload: {},
      correlationId: corrId,
      severity: 'DEBUG',
    });

    let client: PoolClient;
    try {
      client = await originalConnect();
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      sdk.emit({
        type: POSTGRES_EVENTS.CONNECTION_ERROR,
        sourceNodeId: connId,
        occurredAt: Date.now(),
        payload: { errorName: e.name, errorMessage: e.message },
        severity: 'ERROR',
      });
      throw err;
    }

    return patchClient(client, sdk, connId, getCorrelationId);
  };

  return () => {
    (pool as unknown as Record<string, unknown>).query = originalQuery;
    (pool as unknown as Record<string, unknown>).connect = originalConnect;
  };
}

function patchClient(
  client: PoolClient,
  sdk: ObserverSDK,
  connId: ReturnType<typeof asNodeId>,
  getCorrelationId?: () => string | undefined
): PoolClient {
  const originalQuery = client.query.bind(client) as (...a: unknown[]) => Promise<unknown>;
  const originalRelease = client.release.bind(client);

  let activeTxId: ReturnType<typeof asNodeId> | null = null;

  // Instrument client.query — detect BEGIN/COMMIT/ROLLBACK for transaction tracking
  (client as unknown as Record<string, unknown>).query = async function observedClientQuery(
    ...args: Parameters<typeof client.query>
  ) {
    const qInput = args[0] as QueryInput;
    const sql = sanitizeQuery(qInput).trim().toUpperCase();
    const corrId = getCorrelationId?.() ?? getCurrentCorrelationId();

    if (sql === 'BEGIN' || sql === 'START TRANSACTION') {
      const txId = nodeId('pg_tx', ++txSeq);
      activeTxId = txId;
      sdk.emit({
        type: POSTGRES_EVENTS.TX_STARTED,
        sourceNodeId: txId,
        occurredAt: Date.now(),
        payload: { connectionNodeId: connId as string },
        correlationId: corrId,
        severity: 'DEBUG',
      });
      return originalQuery(...(args as unknown[]));
    }

    if (sql === 'COMMIT') {
      if (activeTxId) {
        sdk.emit({
          type: POSTGRES_EVENTS.TX_COMMITTED,
          sourceNodeId: activeTxId,
          occurredAt: Date.now(),
          payload: {},
          correlationId: corrId,
          severity: 'DEBUG',
        });
        activeTxId = null;
      }
      return originalQuery(...(args as unknown[]));
    }

    if (sql === 'ROLLBACK') {
      if (activeTxId) {
        sdk.emit({
          type: POSTGRES_EVENTS.TX_ROLLED_BACK,
          sourceNodeId: activeTxId,
          occurredAt: Date.now(),
          payload: {},
          correlationId: corrId,
          severity: 'WARN',
        });
        activeTxId = null;
      }
      return originalQuery(...(args as unknown[]));
    }

    // Regular query within (possibly) a transaction
    const qId = nodeId('pg_query', ++querySeq);
    sdk.emit({
      type: POSTGRES_EVENTS.QUERY_STARTED,
      sourceNodeId: qId,
      occurredAt: Date.now(),
      payload: {
        sql: sanitizeQuery(qInput),
        values: queryValues(qInput),
        transactionNodeId: activeTxId as string | null,
      },
      correlationId: corrId,
      severity: 'DEBUG',
    });

    const t0 = Date.now();
    try {
      const result = await originalQuery(...(args as unknown[]));
      const r = result as { rowCount?: number };
      sdk.emit({
        type: POSTGRES_EVENTS.QUERY_COMPLETED,
        sourceNodeId: qId,
        occurredAt: Date.now(),
        payload: {
          rowCount: r.rowCount ?? 0,
          durationMs: Date.now() - t0,
        },
        correlationId: corrId,
        severity: 'DEBUG',
      });
      return result;
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      sdk.emit({
        type: POSTGRES_EVENTS.QUERY_FAILED,
        sourceNodeId: qId,
        occurredAt: Date.now(),
        payload: {
          errorName: e.name,
          errorMessage: e.message,
          errorCode: (e as unknown as Record<string, unknown>)['code'],
          durationMs: Date.now() - t0,
          transactionNodeId: activeTxId as string | null,
        },
        correlationId: corrId,
        severity: 'ERROR',
      });
      throw err;
    }
  };

  client.release = (err?: boolean | Error) => {
    sdk.emit({
      type: POSTGRES_EVENTS.CONNECTION_RELEASED,
      sourceNodeId: connId,
      occurredAt: Date.now(),
      payload: { hadError: !!err },
      severity: 'DEBUG',
    });
    originalRelease(err as boolean);
  };

  return client;
}
