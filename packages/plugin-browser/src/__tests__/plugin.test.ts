import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCore, asWorkspaceId, asNodeId } from '@observer-os/core';
import type { ObserverCore } from '@observer-os/core';
import { PluginRegistry, PluginSDKImpl, TraceContext } from '@observer-os/sdk';
import type { SessionInfo } from '@observer-os/sdk';
import { BrowserObserverPlugin } from '../BrowserObserverPlugin.js';
import { BridgeServer } from '../bridge/BridgeServer.js';
import { BROWSER_NODE_TYPES, BROWSER_EVENTS } from '../node-types.js';
import { generateTraceId, generateNodeId } from '../inject/correlation.js';

const WS = asWorkspaceId('ws_browser_test');
const BRIDGE_PORT = 7885; // offset to avoid conflict with other tests

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function postEvents(
  port: number,
  sessionId: string,
  events: object[],
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, events }),
  });
}

// ─── BrowserObserverPlugin tests ──────────────────────────────────────────────

describe('BrowserObserverPlugin — interface contract', () => {
  it('implements ObserverPlugin correctly', () => {
    const plugin = new BrowserObserverPlugin();
    expect(plugin.id).toBe('observer.browser');
    expect(plugin.name).toBe('Browser Observer');
    expect(plugin.runtimeType).toBe('BROWSER');
    expect(typeof plugin.discover).toBe('function');
    expect(typeof plugin.connect).toBe('function');
    expect(typeof plugin.disconnect).toBe('function');
    expect(typeof plugin.getNodeTypes).toBe('function');
  });

  it('discover returns detected=true', async () => {
    const plugin = new BrowserObserverPlugin();
    const result = await plugin.discover({
      id: WS,
      rootPath: '/app',
      name: 'test',
    });
    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('getNodeTypes returns all 7 browser node types', () => {
    const plugin = new BrowserObserverPlugin();
    const types = plugin.getNodeTypes();
    expect(types).toHaveLength(7);
    const typeIds = types.map(t => t.type);
    expect(typeIds).toContain('observer.browser/HttpRequest');
    expect(typeIds).toContain('observer.browser/ConsoleMessage');
    expect(typeIds).toContain('observer.browser/Exception');
    expect(typeIds).toContain('observer.browser/Navigation');
  });

  it('healthCheck before connect reports unhealthy', async () => {
    const plugin = new BrowserObserverPlugin();
    const health = await plugin.onHealthCheck!();
    expect(health.healthy).toBe(false);
  });
});

describe('BrowserObserverPlugin — lifecycle via PluginRegistry', () => {
  let core: ObserverCore;
  let registry: PluginRegistry;
  let plugin: BrowserObserverPlugin;

  beforeEach(() => {
    core = createCore(WS);
    registry = new PluginRegistry(core.sessions);
    plugin = new BrowserObserverPlugin();
    registry.register(plugin, { bridgePort: BRIDGE_PORT });
  });

  afterEach(async () => {
    await registry.disconnectAll();
    core.dispose();
  });

  it('connect starts bridge server', async () => {
    const session = core.sessions.create({ name: 'Browser test' });
    await registry.connect('observer.browser', session);

    expect(plugin.bridgeAddress).toBe(`http://127.0.0.1:${BRIDGE_PORT}`);
    const health = await plugin.onHealthCheck!();
    expect(health.healthy).toBe(true);
  });

  it('disconnect stops bridge server', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.browser', session);
    await registry.disconnect('observer.browser');

    expect(plugin.bridgeAddress).toBeNull();
  });
});

// ─── BridgeServer tests ───────────────────────────────────────────────────────

describe('BridgeServer — HTTP endpoints', () => {
  let core: ObserverCore;
  let bridge: BridgeServer;
  let sdk: PluginSDKImpl;
  let session: ReturnType<typeof core.sessions.create>;

  beforeEach(async () => {
    core = createCore(WS);
    session = core.sessions.create({ name: 'Bridge test' });
    const sessionInfo: SessionInfo = {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name,
      startedAt: session.startedAt,
    };
    sdk = new PluginSDKImpl(core.sessions, sessionInfo, 'observer.browser', {});
    sdk.markConnected();

    bridge = new BridgeServer(sdk, {
      port: BRIDGE_PORT + 1,
      host: '127.0.0.1',
      sessionId: session.id as string,
      corsOrigins: ['*'],
    });
    await bridge.start();
  });

  afterEach(async () => {
    await bridge.stop();
    core.dispose();
  });

  it('GET /observer-config returns sessionId and bridgeUrl', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT + 1}/observer-config`);
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionId: string; bridgeUrl: string };
    expect(body.sessionId).toBe(session.id as string);
    expect(body.bridgeUrl).toBe(`http://127.0.0.1:${BRIDGE_PORT + 1}`);
  });

  it('POST /events emits events into core', async () => {
    const nodeId = 'browser_req_001';
    const res = await postEvents(BRIDGE_PORT + 1, session.id as string, [
      {
        type: BROWSER_EVENTS.FETCH_STARTED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        payload: { method: 'GET', url: '/api/data' },
        correlationId: 'trace_abc',
      },
    ]);
    expect(res.status).toBe(204);

    const events = core.events.read(session.id);
    const found = events.find(e => e.type === BROWSER_EVENTS.FETCH_STARTED);
    expect(found).toBeDefined();
    expect(found?.correlationId).toBe('trace_abc');
    expect(found?.payload['url']).toBe('/api/data');
  });

  it('POST /events emits batch of events preserving order', async () => {
    const nodeId = 'browser_req_batch';
    const res = await postEvents(BRIDGE_PORT + 1, session.id as string, [
      {
        type: BROWSER_EVENTS.FETCH_STARTED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        payload: { method: 'POST', url: '/api/submit' },
      },
      {
        type: BROWSER_EVENTS.FETCH_COMPLETED,
        sourceNodeId: nodeId,
        occurredAt: Date.now() + 1,
        payload: { status: 200, duration: 120 },
      },
    ]);
    expect(res.status).toBe(204);

    const events = core.events.read(session.id);
    const types = events.map(e => e.type);
    const startIdx = types.indexOf(BROWSER_EVENTS.FETCH_STARTED);
    const endIdx = types.indexOf(BROWSER_EVENTS.FETCH_COMPLETED);
    expect(startIdx).toBeLessThan(endIdx);
  });

  it('POST /events materializes node in graph', async () => {
    const nodeId = 'browser_nav_001';
    await postEvents(BRIDGE_PORT + 1, session.id as string, [
      {
        type: BROWSER_EVENTS.NAVIGATION_LOAD,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        payload: { url: 'http://localhost:3000', referrer: null },
      },
    ]);

    const node = core.graph.getNode(nodeId);
    expect(node).toBeDefined();
    expect(node?.sessionId).toBe(session.id);
    expect(node?.metadata['url']).toBe('http://localhost:3000');
  });

  it('POST /events rejects malformed JSON with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT + 1}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json',
    });
    expect(res.status).toBe(400);
  });

  it('POST /events rejects missing events array with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT + 1}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'ses_x' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /observer-inject.js returns 503 when inject script not built', async () => {
    // In test env, dist/browser-inject.js does not exist
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT + 1}/observer-inject.js`);
    // Either 200 (if built) or 503 (if not built yet) — both are valid
    expect([200, 503]).toContain(res.status);
  });

  it('unknown routes return 404', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT + 1}/unknown`);
    expect(res.status).toBe(404);
  });

  it('CORS headers present on all responses', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT + 1}/observer-config`);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('OPTIONS preflight returns 204', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT + 1}/events`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
  });
});

// ─── Cross-domain correlation tests ──────────────────────────────────────────

describe('Cross-domain correlation — browser + backend', () => {
  it('browser fetch event and backend event link via correlationId', async () => {
    const core2 = createCore(WS);
    const session = core2.sessions.create({ name: 'CORS test' });

    const browserNodeId = asNodeId('browser_fetch_cors');
    const backendNodeId = asNodeId('express_route_cors');
    const correlationId = 'trace_cors_001';

    // Browser fetch event
    core2.sessions.emit(session.id, {
      type: BROWSER_EVENTS.FETCH_STARTED,
      sourceNodeId: browserNodeId,
      occurredAt: Date.now(),
      payload: { method: 'POST', url: '/api/orders' },
      correlationId,
    });

    // Backend receives request with same correlationId
    core2.sessions.emit(session.id, {
      type: 'observer.express/route.handler.started',
      sourceNodeId: backendNodeId,
      occurredAt: Date.now(),
      payload: { path: '/api/orders', method: 'POST' },
      correlationId,
    });

    const browserNode = core2.graph.getNode(browserNodeId as string);
    expect(browserNode?.relationships.some(
      r => r.type === 'CORRELATED_WITH' && r.target === backendNodeId
    )).toBe(true);

    core2.dispose();
  });
});

// ─── Injection script logic tests (logic only, no DOM) ────────────────────────

describe('Injection script — correlation utilities', () => {
  it('generateTraceId produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, generateTraceId));
    expect(ids.size).toBe(1000);
  });

  it('generateTraceId format is predictable', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^obs-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('generateNodeId is stable for same inputs', () => {
    const a = generateNodeId('browser', 'fetch:trace_123');
    const b = generateNodeId('browser', 'fetch:trace_123');
    expect(a).toBe(b);
  });

  it('generateNodeId differs for different keys', () => {
    const a = generateNodeId('browser', 'fetch:trace_123');
    const b = generateNodeId('browser', 'fetch:trace_456');
    expect(a).not.toBe(b);
  });
});

describe('BROWSER_NODE_TYPES', () => {
  it('all types have required fields', () => {
    for (const t of BROWSER_NODE_TYPES) {
      expect(typeof t.type).toBe('string');
      expect(t.type.startsWith('observer.browser/')).toBe(true);
      expect(typeof t.displayName).toBe('string');
      expect(typeof t.schemaVersion).toBe('string');
      expect(Array.isArray(t.capabilities)).toBe(true);
    }
  });
});

// ─── W3C TraceContext tests ───────────────────────────────────────────────────

describe('TraceContext.extract', () => {
  it('parses a valid W3C traceparent header', () => {
    const result = TraceContext.extract({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    expect(result).not.toBeNull();
    expect(result!.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(result!.parentId).toBe('00f067aa0ba902b7');
    expect(result!.flags).toBe(1);
    expect(result!.correlationId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('correlationId equals traceId from traceparent', () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const result = TraceContext.extract({
      traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
    });
    expect(result!.correlationId).toBe(traceId);
  });

  it('falls back to x-observer-trace-id when traceparent is absent', () => {
    const result = TraceContext.extract({
      'x-observer-trace-id': 'obs-legacy-trace-id',
    });
    expect(result).not.toBeNull();
    expect(result!.correlationId).toBe('obs-legacy-trace-id');
    expect(result!.traceId).toBe('obs-legacy-trace-id');
  });

  it('returns null for malformed traceparent header', () => {
    const result = TraceContext.extract({
      traceparent: 'bad-header-value',
    });
    expect(result).toBeNull();
  });

  it('returns null when no trace headers are present', () => {
    const result = TraceContext.extract({});
    expect(result).toBeNull();
  });

  it('returns null for traceparent with wrong version', () => {
    const result = TraceContext.extract({
      traceparent: '01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    expect(result).toBeNull();
  });

  it('handles array header values (Node.js IncomingMessage style)', () => {
    const result = TraceContext.extract({
      traceparent: ['00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00'],
    });
    expect(result).not.toBeNull();
    expect(result!.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });
});

describe('TraceContext.inject', () => {
  it('injects a traceparent header', () => {
    const headers: Record<string, string> = {};
    TraceContext.inject(headers, 'a'.repeat(32), 'b'.repeat(16));
    expect(headers['traceparent']).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
  });

  it('injects x-observer-trace-id for backward compat', () => {
    const headers: Record<string, string> = {};
    const traceId = 'a'.repeat(32);
    TraceContext.inject(headers, traceId, 'b'.repeat(16));
    expect(headers['x-observer-trace-id']).toBe(traceId);
  });

  it('round-trip: inject then extract yields the same traceId', () => {
    const traceId = TraceContext.generateTraceId();
    const spanId = TraceContext.generateSpanId();
    const headers: Record<string, string> = {};

    TraceContext.inject(headers, traceId, spanId);

    const parsed = TraceContext.extract(headers);
    expect(parsed).not.toBeNull();
    expect(parsed!.traceId).toBe(traceId);
    expect(parsed!.correlationId).toBe(traceId);
  });
});

describe('TraceContext.generateTraceId / generateSpanId', () => {
  it('generateTraceId returns 32 lower-case hex chars', () => {
    const id = TraceContext.generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generateSpanId returns 16 lower-case hex chars', () => {
    const id = TraceContext.generateSpanId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generateTraceId produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => TraceContext.generateTraceId()));
    expect(ids.size).toBe(100);
  });

  it('generateSpanId produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => TraceContext.generateSpanId()));
    expect(ids.size).toBe(100);
  });
});
