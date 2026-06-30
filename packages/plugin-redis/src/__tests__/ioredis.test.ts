import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCore, asWorkspaceId } from '@observer-os/core';
import type { ObserverCore } from '@observer-os/core';
import { PluginSDKImpl, runWithCorrelation } from '@observer-os/sdk';
import type { SessionInfo } from '@observer-os/sdk';
import { RedisPlugin, REDIS_EVENTS } from '../index.js';

const WS = asWorkspaceId('ws_redis_ioredis_test');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCore() {
  const core = createCore(WS);
  const session = core.sessions.create({ name: 'Redis ioredis test' });
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
 * Minimal ioredis-like client mock.
 * sendCommand(command) — command has { name, args }
 */
function makeIoRedisClient(overrides: {
  commandError?: Error;
  commandResult?: unknown;
  pipelineResults?: unknown[];
} = {}) {
  const commandResult = overrides.commandResult ?? 'OK';

  // Fake pipeline
  const fakePipelineQueue: Array<{ name: string; args: unknown[] }> = [];
  const fakePipeline: Record<string, unknown> = {
    // ioredis pipeline stores commands in _queue
    get _queue() { return fakePipelineQueue; },
    // Allow adding commands
    addCommand(name: string, ...args: unknown[]) {
      fakePipelineQueue.push({ name, args });
      return this;
    },
    exec: async () => {
      if (overrides.pipelineResults !== undefined) {
        return overrides.pipelineResults.map((r) => [null, r]);
      }
      return fakePipelineQueue.map(() => [null, commandResult]);
    },
  };

  const client: Record<string, unknown> = {
    // ioredis-style: connector property signals ioredis detection
    connector: {},
    options: { lazyConnect: false },

    sendCommand: async (command: unknown) => {
      if (overrides.commandError) throw overrides.commandError;
      return commandResult;
    },

    pipeline: () => {
      // Return a fresh fake pipeline each call
      fakePipelineQueue.length = 0;
      return fakePipeline;
    },
  };

  return { client, fakePipeline, fakePipelineQueue };
}

function getEvents(core: ObserverCore, sessionId: string) {
  const { asSessionId } = require('@observer-os/core');
  return core.events.read(asSessionId(sessionId));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RedisPlugin — ioredis instrumentation', () => {
  let ctx: ReturnType<typeof makeCore>;

  beforeEach(() => { ctx = makeCore(); });

  describe('single command', () => {
    it('emits COMMAND_STARTED and COMMAND_COMPLETED on success', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeIoRedisClient();
      const plugin = new RedisPlugin(sdk);
      plugin.instrument(client, { clientType: 'ioredis' });

      await (client['sendCommand'] as (cmd: unknown) => Promise<unknown>)({ name: 'GET', args: ['mykey'] });

      const events = core.events.read(session.id);
      const types = events.map((e) => e.type);
      expect(types).toContain(REDIS_EVENTS.COMMAND_STARTED);
      expect(types).toContain(REDIS_EVENTS.COMMAND_COMPLETED);
    });

    it('emits COMMAND_FAILED with severity ERROR on command error', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeIoRedisClient({ commandError: new Error('WRONGTYPE Operation against a key') });
      const plugin = new RedisPlugin(sdk);
      plugin.instrument(client, { clientType: 'ioredis' });

      await expect(
        (client['sendCommand'] as (cmd: unknown) => Promise<unknown>)({ name: 'LPUSH', args: ['mykey', 'val'] })
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
      const { client } = makeIoRedisClient({ commandResult: 'world' });
      new RedisPlugin(sdk).instrument(client, { clientType: 'ioredis' });

      await (client['sendCommand'] as (cmd: unknown) => Promise<unknown>)({ name: 'get', args: ['hello'] });

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
      const { client } = makeIoRedisClient();
      new RedisPlugin(sdk).instrument(client, { clientType: 'ioredis' });

      await runWithCorrelation('req_redis_abc', async () => {
        await (client['sendCommand'] as (cmd: unknown) => Promise<unknown>)({ name: 'SET', args: ['k', 'v'] });
      });

      const events = core.events.read(session.id);
      for (const e of events) {
        expect((e as unknown as Record<string, unknown>)['correlationId']).toBe('req_redis_abc');
      }
    });

    it('getCorrelationId option takes precedence over AsyncLocalStorage', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeIoRedisClient();
      new RedisPlugin(sdk).instrument(client, {
        clientType: 'ioredis',
        getCorrelationId: () => 'explicit_corr',
      });

      await (client['sendCommand'] as (cmd: unknown) => Promise<unknown>)({ name: 'GET', args: ['k'] });

      const events = core.events.read(session.id);
      for (const e of events) {
        expect((e as unknown as Record<string, unknown>)['correlationId']).toBe('explicit_corr');
      }
    });
  });

  describe('dispose', () => {
    it('stops emitting events after dispose()', async () => {
      const { core, session, sdk } = ctx;
      const { client } = makeIoRedisClient();
      const plugin = new RedisPlugin(sdk);
      plugin.instrument(client, { clientType: 'ioredis' });
      plugin.dispose();

      await (client['sendCommand'] as (cmd: unknown) => Promise<unknown>)({ name: 'GET', args: ['k'] });

      expect(core.events.read(session.id)).toHaveLength(0);
    });
  });

  describe('pipeline', () => {
    it('emits PIPELINE_STARTED and PIPELINE_COMPLETED with commandCount', async () => {
      const { core, session, sdk } = ctx;
      const { client, fakePipeline, fakePipelineQueue } = makeIoRedisClient();
      new RedisPlugin(sdk).instrument(client, { clientType: 'ioredis' });

      // Get the instrumented pipeline
      const pipe = (client['pipeline'] as () => Record<string, unknown>)();

      // Simulate adding commands to the queue
      fakePipelineQueue.push({ name: 'GET', args: ['key1'] });
      fakePipelineQueue.push({ name: 'SET', args: ['key2', 'val'] });

      await (pipe['exec'] as () => Promise<unknown>)();

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
