import { describe, it, expect, beforeEach } from 'vitest';
import { createCore, asWorkspaceId } from '@observer-os/core';
import type { ObserverCore } from '@observer-os/core';
import { PluginSDKImpl, runWithCorrelation } from '@observer-os/sdk';
import type { SessionInfo } from '@observer-os/sdk';
import { RedisPlugin, REDIS_EVENTS } from '../index.js';

const WS = asWorkspaceId('ws_redis_node_test');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCore() {
  const core = createCore(WS);
  const session = core.sessions.create({ name: 'Redis node-redis test' });
  const info: SessionInfo = {
    id: session.id,
    workspaceId: session.workspaceId,
    name: session.name,
    startedAt: session.startedAt,
  };
  const sdk = new PluginSDKImpl(core.sessions, info, 'observer.redis', {});
  sdk.markConnected();
  return { core, session, sdk };
}

/**
 * Minimal node-redis v4-like client mock.
 * sendCommand(args: string[]) — args[0] is the command name, args[1] is the key.
 */
function makeNodeRedisClient(overrides: {
  commandError?: Error;
  commandResult?: unknown;
  pipelineResults?: unknown[];
} = {}) {
  const commandResult = overrides.commandResult ?? 'OK';

  // Fake multi/pipeline queue (node-redis stores as string[][])
  const fakeMultiQueue: unknown[][] = [];

  const fakeMulti: Record<string, unknown> = {
    get _queue() { return fakeMultiQueue; },
    addCommand(...args: unknown[]) {
      fakeMultiQueue.push(args);
      return this;
    },
    exec: async () => {
      if (overrides.pipelineResults !== undefined) {
        return overrides.pipelineResults;
      }
      return fakeMultiQueue.map(() => commandResult);
    },
  };

  const client: Record<string, unknown> = {
    // node-redis v4 signals
    isReady: true,
    isOpen: true,

    sendCommand: async (args: unknown[]) => {
      if (overrides.commandError) throw overrides.commandError;
      return commandResult;
    },

    multi: () => {
      fakeMultiQueue.length = 0;
      return fakeMulti;
    },
  };

  return { client, fakeMulti, fakeMultiQueue };
}

function getEvents(core: ObserverCore, sessionId: string) {
  const { asSessionId } = require('@observer-os/core');
  return core.events.read(asSessionId(sessionId));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RedisPlugin — node-redis instrumentation', () => {
  let ctx: ReturnType<typeof makeCore>;

  beforeEach(() => { ctx = makeCore(); });

  describe('single command', () => {
    it('emits COMMAND_STARTED and COMMAND_COMPLETED on success', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeNodeRedisClient();
      const plugin = new RedisPlugin(sdk);
      plugin.instrument(client, { clientType: 'node-redis' });

      await (client['sendCommand'] as (args: string[]) => Promise<unknown>)(['GET', 'mykey']);

      const events = core.events.read(session.id);
      const types = events.map((e) => e.type);
      expect(types).toContain(REDIS_EVENTS.COMMAND_STARTED);
      expect(types).toContain(REDIS_EVENTS.COMMAND_COMPLETED);
    });

    it('emits COMMAND_FAILED with severity ERROR on command error', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeNodeRedisClient({ commandError: new Error('WRONGTYPE Operation against a key') });
      const plugin = new RedisPlugin(sdk);
      plugin.instrument(client, { clientType: 'node-redis' });

      await expect(
        (client['sendCommand'] as (args: string[]) => Promise<unknown>)(['LPUSH', 'mykey', 'val'])
      ).rejects.toThrow('WRONGTYPE');

      const events = core.events.read(session.id);
      const types = events.map((e) => e.type);
      expect(types).toContain(REDIS_EVENTS.COMMAND_FAILED);
      expect(types).not.toContain(REDIS_EVENTS.COMMAND_COMPLETED);

      const failEvent = events.find((e) => e.type === REDIS_EVENTS.COMMAND_FAILED)!;
      expect(failEvent.severity).toBe('ERROR');
      expect((failEvent.payload as Record<string, unknown>)['errorMessage']).toContain('WRONGTYPE');
    });

    it('COMMAND_COMPLETED payload has commandName, keyArg, duration', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeNodeRedisClient({ commandResult: 'world' });
      new RedisPlugin(sdk).instrument(client, { clientType: 'node-redis' });

      await (client['sendCommand'] as (args: string[]) => Promise<unknown>)(['GET', 'hello']);

      const events = core.events.read(session.id);
      const doneEvent = events.find((e) => e.type === REDIS_EVENTS.COMMAND_COMPLETED)!;
      const p = doneEvent.payload as Record<string, unknown>;
      expect(p['commandName']).toBe('GET');
      expect(p['keyArg']).toBe('hello');
      expect(typeof p['duration']).toBe('number');
      expect(typeof p['durationMs']).toBe('number');
    });

    it('passes correlationId from getCurrentCorrelationId to emitted events', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeNodeRedisClient();
      new RedisPlugin(sdk).instrument(client, { clientType: 'node-redis' });

      await runWithCorrelation('req_node_redis_xyz', async () => {
        await (client['sendCommand'] as (args: string[]) => Promise<unknown>)(['SET', 'k', 'v']);
      });

      const events = core.events.read(session.id);
      for (const e of events) {
        expect((e as unknown as Record<string, unknown>)['correlationId']).toBe('req_node_redis_xyz');
      }
    });

    it('getCorrelationId option takes precedence', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeNodeRedisClient();
      new RedisPlugin(sdk).instrument(client, {
        clientType: 'node-redis',
        getCorrelationId: () => 'node_explicit_corr',
      });

      await (client['sendCommand'] as (args: string[]) => Promise<unknown>)(['GET', 'k']);

      const events = core.events.read(session.id);
      for (const e of events) {
        expect((e as unknown as Record<string, unknown>)['correlationId']).toBe('node_explicit_corr');
      }
    });
  });

  describe('dispose', () => {
    it('stops emitting events after dispose()', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeNodeRedisClient();
      const plugin = new RedisPlugin(sdk);
      plugin.instrument(client, { clientType: 'node-redis' });
      plugin.dispose();

      await (client['sendCommand'] as (args: string[]) => Promise<unknown>)(['GET', 'k']);

      expect(core.events.read(session.id)).toHaveLength(0);
    });
  });

  describe('pipeline (multi)', () => {
    it('emits PIPELINE_STARTED and PIPELINE_COMPLETED with commandCount', async () => {
      const { core, session, sdk } = ctx;
      const { client, fakeMultiQueue } = makeNodeRedisClient();
      new RedisPlugin(sdk).instrument(client, { clientType: 'node-redis' });

      // Get the instrumented multi
      const multi = (client['multi'] as () => Record<string, unknown>)();

      // Simulate adding commands to the queue
      fakeMultiQueue.push(['GET', 'key1']);
      fakeMultiQueue.push(['INCR', 'counter']);

      await (multi['exec'] as () => Promise<unknown>)();

      const events = core.events.read(session.id);
      const types = events.map((e) => e.type);
      expect(types).toContain(REDIS_EVENTS.PIPELINE_STARTED);
      expect(types).toContain(REDIS_EVENTS.PIPELINE_COMPLETED);

      const startEvent = events.find((e) => e.type === REDIS_EVENTS.PIPELINE_STARTED)!;
      expect((startEvent.payload as Record<string, unknown>)['commandCount']).toBe(2);

      const doneEvent = events.find((e) => e.type === REDIS_EVENTS.PIPELINE_COMPLETED)!;
      expect((doneEvent.payload as Record<string, unknown>)['commandCount']).toBe(2);
    });
  });
});
