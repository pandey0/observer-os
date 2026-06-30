import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { createCore, asWorkspaceId } from '@observer-os/core';
import type { ObserverCore } from '@observer-os/core';
import { PluginSDKImpl } from '@observer-os/sdk';
import type { SessionInfo } from '@observer-os/sdk';
import { PostgresPlugin, POSTGRES_EVENTS } from '../index.js';

const WS = asWorkspaceId('ws_pg_test');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCore() {
  const core = createCore(WS);
  const session = core.sessions.create({ name: 'PG test' });
  const info: SessionInfo = {
    id: session.id,
    workspaceId: session.workspaceId,
    name: session.name,
    startedAt: session.startedAt,
  };
  const sdk = new PluginSDKImpl(core.sessions, info, 'observer.postgres', {});
  sdk.markConnected();
  return { core, session, sdk };
}

/** Minimal pg Pool mock — records calls, resolves with fake result */
function makePool(overrides: Partial<{
  queryResult: QueryResult;
  queryError: Error;
  connectError: Error;
}> = {}): Pool {
  const fakeResult: QueryResult = overrides.queryResult ?? {
    rows: [{ id: 1 }],
    rowCount: 1,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };

  const fakeClient: Partial<PoolClient> = {
    query: async (..._args: unknown[]) => {
      if (overrides.queryError) throw overrides.queryError;
      return fakeResult;
    },
    release: (_err?: boolean | Error) => {},
  };

  return {
    query: async (..._args: unknown[]) => {
      if (overrides.queryError) throw overrides.queryError;
      return fakeResult;
    },
    connect: async () => {
      if (overrides.connectError) throw overrides.connectError;
      return fakeClient as PoolClient;
    },
  } as unknown as Pool;
}

function getEvents(core: ObserverCore, sessionId: string) {
  const { asSessionId } = require('@observer-os/core');
  return core.events.read(asSessionId(sessionId));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PostgresPlugin', () => {
  let ctx: ReturnType<typeof makeCore>;

  beforeEach(() => { ctx = makeCore(); });

  describe('pool.query instrumentation', () => {
    it('emits QUERY_STARTED and QUERY_COMPLETED on success', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      const plugin = new PostgresPlugin(sdk);
      plugin.instrument(pool);

      await pool.query('SELECT 1');

      const events = core.events.read(session.id);
      const types = events.map((e) => e.type);
      expect(types).toContain(POSTGRES_EVENTS.QUERY_STARTED);
      expect(types).toContain(POSTGRES_EVENTS.QUERY_COMPLETED);
    });

    it('emits QUERY_STARTED and QUERY_FAILED on error', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool({ queryError: new Error('relation "users" does not exist') });
      const plugin = new PostgresPlugin(sdk);
      plugin.instrument(pool);

      await expect(pool.query('SELECT * FROM users')).rejects.toThrow('does not exist');

      const events = core.events.read(session.id);
      const types = events.map((e) => e.type);
      expect(types).toContain(POSTGRES_EVENTS.QUERY_STARTED);
      expect(types).toContain(POSTGRES_EVENTS.QUERY_FAILED);

      const failEvent = events.find((e) => e.type === POSTGRES_EVENTS.QUERY_FAILED)!;
      expect(failEvent.severity).toBe('ERROR');
      expect((failEvent.payload as Record<string, unknown>)['errorMessage']).toContain('does not exist');
    });

    it('stores sql in QUERY_STARTED payload', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      new PostgresPlugin(sdk).instrument(pool);

      await pool.query('SELECT $1::text', ['hello']);

      const events = core.events.read(session.id);
      const startEvent = events.find((e) => e.type === POSTGRES_EVENTS.QUERY_STARTED)!;
      expect((startEvent.payload as Record<string, unknown>)['sql']).toBe('SELECT $1::text');
    });

    it('stores rowCount in QUERY_COMPLETED payload', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool({ queryResult: { rows: [{ id: 1 }, { id: 2 }], rowCount: 2, command: 'SELECT', oid: 0, fields: [] } });
      new PostgresPlugin(sdk).instrument(pool);

      await pool.query('SELECT id FROM things');

      const events = core.events.read(session.id);
      const doneEvent = events.find((e) => e.type === POSTGRES_EVENTS.QUERY_COMPLETED)!;
      expect((doneEvent.payload as Record<string, unknown>)['rowCount']).toBe(2);
    });
  });

  describe('pool.connect instrumentation', () => {
    it('emits CONNECTION_ACQUIRED on successful connect', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      new PostgresPlugin(sdk).instrument(pool);

      const client = await pool.connect();
      client.release();

      const events = core.events.read(session.id);
      expect(events.map((e) => e.type)).toContain(POSTGRES_EVENTS.CONNECTION_ACQUIRED);
    });

    it('emits CONNECTION_ERROR when connect fails', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool({ connectError: new Error('ECONNREFUSED') });
      new PostgresPlugin(sdk).instrument(pool);

      await expect(pool.connect()).rejects.toThrow('ECONNREFUSED');

      const events = core.events.read(session.id);
      expect(events.map((e) => e.type)).toContain(POSTGRES_EVENTS.CONNECTION_ERROR);
    });

    it('emits CONNECTION_RELEASED on client.release()', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      new PostgresPlugin(sdk).instrument(pool);

      const client = await pool.connect();
      client.release();

      const events = core.events.read(session.id);
      expect(events.map((e) => e.type)).toContain(POSTGRES_EVENTS.CONNECTION_RELEASED);
    });
  });

  describe('transaction instrumentation via client', () => {
    it('emits TX_STARTED on BEGIN, TX_COMMITTED on COMMIT', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      new PostgresPlugin(sdk).instrument(pool);

      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT 1');
      await client.query('COMMIT');
      client.release();

      const types = core.events.read(session.id).map((e) => e.type);
      expect(types).toContain(POSTGRES_EVENTS.TX_STARTED);
      expect(types).toContain(POSTGRES_EVENTS.TX_COMMITTED);
      expect(types).not.toContain(POSTGRES_EVENTS.TX_ROLLED_BACK);
    });

    it('emits TX_ROLLED_BACK on ROLLBACK', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      new PostgresPlugin(sdk).instrument(pool);

      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('ROLLBACK');
      client.release();

      const types = core.events.read(session.id).map((e) => e.type);
      expect(types).toContain(POSTGRES_EVENTS.TX_STARTED);
      expect(types).toContain(POSTGRES_EVENTS.TX_ROLLED_BACK);
      expect(types).not.toContain(POSTGRES_EVENTS.TX_COMMITTED);
    });

    it('attaches transactionNodeId to queries inside transaction', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      new PostgresPlugin(sdk).instrument(pool);

      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('INSERT INTO things VALUES ($1)', [42]);
      await client.query('COMMIT');
      client.release();

      const events = core.events.read(session.id);
      const txStart = events.find((e) => e.type === POSTGRES_EVENTS.TX_STARTED)!;
      const qStart  = events.find((e) => e.type === POSTGRES_EVENTS.QUERY_STARTED)!;

      expect((qStart.payload as Record<string, unknown>)['transactionNodeId'])
        .toBe(txStart.sourceNodeId);
    });
  });

  describe('correlationId', () => {
    it('passes correlationId from getCorrelationId to all emitted events', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      new PostgresPlugin(sdk, { getCorrelationId: () => 'req_abc123' }).instrument(pool);

      await pool.query('SELECT 1');

      const events = core.events.read(session.id);
      for (const e of events) {
        expect((e as unknown as Record<string, unknown>)['correlationId']).toBe('req_abc123');
      }
    });
  });

  describe('dispose', () => {
    it('stops emitting events after dispose()', async () => {
      const { core, session, sdk } = ctx;
      const pool = makePool();
      const plugin = new PostgresPlugin(sdk);
      plugin.instrument(pool);
      plugin.dispose();

      await pool.query('SELECT 1');

      // No events emitted — pool.query is back to original (no observer wrapper)
      expect(core.events.read(session.id)).toHaveLength(0);
    });
  });
});
