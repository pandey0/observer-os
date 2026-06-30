import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PluginRegistry,
  PluginSDKImpl,
  UpcasterRegistry,
  asNodeId,
  asWorkspaceId,
  newNodeId,
} from '../index.js';
import type { ObserverPlugin, ObserverSDK, DiscoveryResult, Workspace, SessionInfo, PluginConfig, HealthStatus } from '../index.js';
import { createCore } from '@observer-os/core';
import type { ObserverCore, NodeTypeRegistration } from '@observer-os/core';

const WS = asWorkspaceId('ws_sdk_test');

// ─── Mock plugin ─────────────────────────────────────────────────────────────

class MockBrowserPlugin implements ObserverPlugin {
  readonly id = 'observer.browser';
  readonly name = 'Browser Observer';
  readonly version = '0.1.0';
  readonly sdkVersion = '0.1.0';
  readonly runtimeType = 'BROWSER' as const;

  sdk: ObserverSDK | null = null;
  connected = false;
  paused = false;
  connectCalls = 0;
  disconnectCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;

  async discover(_workspace: Workspace): Promise<DiscoveryResult> {
    return { detected: true, confidence: 0.95, version: '120.0.0' };
  }

  async connect(_session: SessionInfo, sdk: ObserverSDK, _config?: PluginConfig): Promise<void> {
    this.sdk = sdk;
    this.connected = true;
    this.connectCalls++;

    // Simulate plugin emitting its first event on connect
    const nodeId = sdk.generateNodeId('window');
    sdk.emit({
      type: 'observer.browser/navigation.started',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { url: 'http://localhost:3000', initiator: 'load' },
      severity: 'INFO',
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.sdk = null;
    this.disconnectCalls++;
  }

  async onSessionPause(): Promise<void> {
    this.paused = true;
    this.pauseCalls++;
  }

  async onSessionResume(): Promise<void> {
    this.paused = false;
    this.resumeCalls++;
  }

  async onHealthCheck(): Promise<HealthStatus> {
    return { healthy: this.connected, message: this.connected ? 'OK' : 'disconnected' };
  }

  getNodeTypes(): NodeTypeRegistration[] {
    return [
      {
        type: 'observer.browser/Navigation',
        displayName: 'Navigation',
        description: 'Page navigation event',
        schemaVersion: '1.0.0',
        capabilities: ['WATCH', 'TIMELINE'],
        domainId: 'browser' as ReturnType<typeof import('@observer-os/core').asDomainId>,
      },
    ];
  }
}

// ─── Test setup ──────────────────────────────────────────────────────────────

let core: ObserverCore;
let registry: PluginRegistry;
let plugin: MockBrowserPlugin;

beforeEach(() => {
  core = createCore(WS);
  registry = new PluginRegistry(core.sessions);
  plugin = new MockBrowserPlugin();
});

afterEach(async () => {
  await registry.disconnectAll();
  core.dispose();
});

// ─── PluginRegistry tests ─────────────────────────────────────────────────────

describe('PluginRegistry — registration', () => {
  it('registers plugin and lists it', () => {
    registry.register(plugin);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.id).toBe('observer.browser');
  });

  it('rejects duplicate registration', () => {
    registry.register(plugin);
    expect(() => registry.register(plugin)).toThrow(/already registered/);
  });

  it('unregisters plugin', () => {
    registry.register(plugin);
    registry.unregister('observer.browser');
    expect(registry.list()).toHaveLength(0);
  });

  it('rejects unregister while connected', async () => {
    registry.register(plugin);
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    expect(() => registry.unregister('observer.browser')).toThrow(/disconnect first/);
  });

  it('initial status is REGISTERED', () => {
    registry.register(plugin);
    expect(registry.getStatus('observer.browser')).toBe('REGISTERED');
  });
});

describe('PluginRegistry — discovery', () => {
  it('discover returns detected=true for mock plugin', async () => {
    registry.register(plugin);
    const workspace: Workspace = { id: WS, rootPath: '/app', name: 'test-app' };
    const results = await registry.discover(workspace);
    expect(results.get('observer.browser')).toBe(true);
    expect(registry.getStatus('observer.browser')).toBe('DISCOVERED');
  });
});

describe('PluginRegistry — connect / disconnect', () => {
  beforeEach(() => { registry.register(plugin); });

  it('connect transitions to CONNECTED', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    expect(registry.getStatus('observer.browser')).toBe('CONNECTED');
    expect(plugin.connectCalls).toBe(1);
    expect(plugin.connected).toBe(true);
  });

  it('connect idempotent — second call is no-op', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);
    await registry.connect('observer.browser', session);

    expect(plugin.connectCalls).toBe(1);
  });

  it('plugin gets live sdk.isConnected() = true after connect', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    expect(plugin.sdk?.isConnected()).toBe(true);
  });

  it('disconnect transitions to DISCONNECTED', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);
    await registry.disconnect('observer.browser');

    expect(registry.getStatus('observer.browser')).toBe('DISCONNECTED');
    expect(plugin.disconnectCalls).toBe(1);
    expect(plugin.connected).toBe(false);
  });

  it('plugin emits event during connect — appears in graph', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    const events = core.events.read(session.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('observer.browser/navigation.started');
  });

  it('disconnected sdk rejects emit', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);
    const sdk = plugin.sdk!;
    await registry.disconnect('observer.browser');

    expect(() => sdk.emit({
      type: 'observer.browser/test',
      sourceNodeId: newNodeId('n'),
      occurredAt: Date.now(),
      payload: {},
    })).toThrow(/not connected/);
  });
});

describe('PluginRegistry — pause / resume', () => {
  beforeEach(() => { registry.register(plugin); });

  it('pause transitions to PAUSED and calls onSessionPause', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);
    await registry.pause('observer.browser');

    expect(registry.getStatus('observer.browser')).toBe('PAUSED');
    expect(plugin.pauseCalls).toBe(1);
    expect(plugin.paused).toBe(true);
  });

  it('resume transitions to CONNECTED and calls onSessionResume', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);
    await registry.pause('observer.browser');
    await registry.resume('observer.browser');

    expect(registry.getStatus('observer.browser')).toBe('CONNECTED');
    expect(plugin.resumeCalls).toBe(1);
    expect(plugin.paused).toBe(false);
  });
});

describe('PluginRegistry — health', () => {
  it('reports health for all plugins', async () => {
    registry.register(plugin);
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    const health = await registry.health();
    expect(health.get('observer.browser')?.healthy).toBe(true);
    expect(health.get('observer.browser')?.message).toBe('OK');
  });
});

describe('PluginRegistry — logging', () => {
  it('collects plugin log entries via subscriber', async () => {
    registry.register(plugin);
    const logs: string[] = [];
    registry.onPluginLog(entry => logs.push(`${entry.level}:${entry.message}`));

    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    // Force plugin to log via sdk
    const entry = registry.getEntry('observer.browser');
    entry?.sdk?.log('info', 'test message');

    expect(logs).toContain('info:test message');
  });
});

// ─── PluginSDKImpl tests ──────────────────────────────────────────────────────

describe('PluginSDKImpl', () => {
  it('generateNodeId is stable for same key', () => {
    const core2 = createCore(WS);
    const session = core2.sessions.create();
    const sessionInfo: SessionInfo = {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name,
      startedAt: session.startedAt,
    };

    const sdk = new PluginSDKImpl(core2.sessions, sessionInfo, 'observer.browser', {});
    sdk.markConnected();

    const id1 = sdk.generateNodeId('window-main');
    const id2 = sdk.generateNodeId('window-main');
    expect(id1).toBe(id2);

    const different = sdk.generateNodeId('window-secondary');
    expect(different).not.toBe(id1);

    core2.dispose();
  });

  it('emitBatch emits all events in order', async () => {
    registry.register(plugin);
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    const nodeId = newNodeId('node');
    const results = plugin.sdk!.emitBatch([
      { type: 'observer.browser/network.request.started', sourceNodeId: nodeId, occurredAt: Date.now(), payload: { url: '/a' } },
      { type: 'observer.browser/network.request.completed', sourceNodeId: nodeId, occurredAt: Date.now(), payload: { status: 200 } },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.sequenceNumber).toBeLessThan(results[1]!.sequenceNumber);
  });

  it('getConfig returns plugin config', async () => {
    registry.register(plugin, { timeout: 5000, verbose: true });
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);

    const config = plugin.sdk!.getConfig<{ timeout: number; verbose: boolean }>();
    expect(config.timeout).toBe(5000);
    expect(config.verbose).toBe(true);
  });

  it('getSession returns session info', async () => {
    registry.register(plugin);
    const session = core.sessions.create({ name: 'SDK Test Session' });
    await registry.connect('observer.browser', session);

    const info = plugin.sdk!.getSession();
    expect(info.id).toBe(session.id);
    expect(info.name).toBe('SDK Test Session');
  });
});

// ─── connectToDefault ─────────────────────────────────────────────────────────

describe('connectToDefault', () => {
  let testCore: ObserverCore;

  beforeEach(() => {
    testCore = createCore(WS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    testCore.dispose();
  });

  it('connects to session returned by /api/sessions/default', async () => {
    const sessionId = 'default-session-id';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: sessionId }),
    }));

    const session = testCore.sessions.create({ name: 'placeholder' });
    const sessionInfo: import('../types/plugin.js').SessionInfo = {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name ?? 'placeholder',
      startedAt: session.startedAt,
    };
    const sdk = new PluginSDKImpl(testCore.sessions, sessionInfo, 'test.plugin', { daemonUrl: 'http://localhost:4000' });
    const connectSpy = vi.spyOn(sdk, 'connect').mockResolvedValue(undefined);

    await sdk.connectToDefault();

    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/sessions/default');
    expect(connectSpy).toHaveBeenCalledWith(sessionId);
  });

  it('uses daemonUrl from config when no argument given', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'some-id' }),
    }));

    const session = testCore.sessions.create({ name: 'cfg-test' });
    const sessionInfo: import('../types/plugin.js').SessionInfo = {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name ?? 'cfg-test',
      startedAt: session.startedAt,
    };
    const sdk = new PluginSDKImpl(testCore.sessions, sessionInfo, 'test.plugin', { daemonUrl: 'http://daemon-host:9000' });
    vi.spyOn(sdk, 'connect').mockResolvedValue(undefined);

    await sdk.connectToDefault();

    expect(fetch).toHaveBeenCalledWith('http://daemon-host:9000/api/sessions/default');
  });

  it('throws when daemon unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const session = testCore.sessions.create({ name: 'err-test' });
    const sessionInfo: import('../types/plugin.js').SessionInfo = {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name ?? 'err-test',
      startedAt: session.startedAt,
    };
    const sdk = new PluginSDKImpl(testCore.sessions, sessionInfo, 'test.plugin', { daemonUrl: 'http://localhost:4000' });
    await expect(sdk.connectToDefault()).rejects.toThrow('ECONNREFUSED');
  });

  it('throws when daemon returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const session = testCore.sessions.create({ name: 'err-503' });
    const sessionInfo: import('../types/plugin.js').SessionInfo = {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name ?? 'err-503',
      startedAt: session.startedAt,
    };
    const sdk = new PluginSDKImpl(testCore.sessions, sessionInfo, 'test.plugin', { daemonUrl: 'http://localhost:4000' });
    await expect(sdk.connectToDefault()).rejects.toThrow('HTTP 503');
  });
});

// ─── UpcasterRegistry tests ───────────────────────────────────────────────────

describe('UpcasterRegistry', () => {
  let upcasters: UpcasterRegistry;

  beforeEach(() => { upcasters = new UpcasterRegistry(); });

  it('returns event unchanged when no upcasters registered', () => {
    const session = core.sessions.create();
    const event = core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: asNodeId('n'),
      occurredAt: Date.now(),
      payload: { url: '/api' },
    });

    const result = upcasters.upcast(event);
    expect(result).toBe(event); // same reference
  });

  it('applies single upcaster — adds new field', () => {
    upcasters.register(
      'observer.browser/network.request.started',
      '1.0.0',
      '2.0.0',
      payload => ({ ...payload, method: payload['method'] ?? 'GET' })
    );

    const session = core.sessions.create();
    const event = core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: asNodeId('n'),
      occurredAt: Date.now(),
      payload: { url: '/api' },
      schemaVersion: '1.0.0',
    });

    const upcasted = upcasters.upcast(event);
    expect(upcasted.schemaVersion).toBe('2.0.0');
    expect(upcasted.payload['method']).toBe('GET');
    expect(upcasted.payload['url']).toBe('/api');
  });

  it('chains multiple upcasters 1.0.0 → 2.0.0 → 3.0.0', () => {
    upcasters.register(
      'observer.browser/network.request.started',
      '1.0.0',
      '2.0.0',
      payload => ({ ...payload, method: payload['method'] ?? 'GET' })
    );
    upcasters.register(
      'observer.browser/network.request.started',
      '2.0.0',
      '3.0.0',
      payload => ({ ...payload, headers: payload['headers'] ?? {} })
    );

    const session = core.sessions.create();
    const event = core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: asNodeId('n'),
      occurredAt: Date.now(),
      payload: { url: '/api' },
      schemaVersion: '1.0.0',
    });

    const upcasted = upcasters.upcast(event);
    expect(upcasted.schemaVersion).toBe('3.0.0');
    expect(upcasted.payload['method']).toBe('GET');
    expect(upcasted.payload['headers']).toEqual({});
  });

  it('skips upcaster chain for already-current version', () => {
    upcasters.register(
      'observer.browser/network.request.started',
      '1.0.0',
      '2.0.0',
      payload => ({ ...payload, method: 'GET' })
    );

    const session = core.sessions.create();
    const event = core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: asNodeId('n'),
      occurredAt: Date.now(),
      payload: { url: '/api', method: 'POST' },
      schemaVersion: '2.0.0',
    });

    const result = upcasters.upcast(event);
    expect(result).toBe(event); // same ref — no upcasting done
    expect(result.payload['method']).toBe('POST');
  });

  it('duplicate registration is silently ignored', () => {
    const fn = (p: Record<string, unknown>) => p;
    upcasters.register('observer.test/e', '1.0.0', '2.0.0', fn);
    upcasters.register('observer.test/e', '1.0.0', '2.0.0', fn);
    expect(upcasters.depth('observer.test/e')).toBe(1);
  });

  it('upcasted event is frozen', () => {
    upcasters.register(
      'observer.test/e',
      '1.0.0',
      '2.0.0',
      payload => ({ ...payload, added: true })
    );

    const session = core.sessions.create();
    const event = core.sessions.emit(session.id, {
      type: 'observer.test/e',
      sourceNodeId: asNodeId('n'),
      occurredAt: Date.now(),
      payload: {},
      schemaVersion: '1.0.0',
    });

    const upcasted = upcasters.upcast(event);
    expect(Object.isFrozen(upcasted)).toBe(true);
    expect(Object.isFrozen(upcasted.payload)).toBe(true);
  });
});
