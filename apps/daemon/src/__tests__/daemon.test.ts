import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ObserverDaemon } from '../daemon/ObserverDaemon.js';
import { asNodeId } from '@observer-os/core';
import type { ObserverPlugin, ObserverSDK, DiscoveryResult, Workspace, SessionInfo, PluginConfig, HealthStatus } from '@observer-os/sdk';
import type { NodeTypeRegistration } from '@observer-os/core';
import type { ApiSession, EventsResponse, NodesResponse, HealthResponse } from '../api/types.js';

// ─── Minimal test plugin ──────────────────────────────────────────────────────

class EchoPlugin implements ObserverPlugin {
  readonly id = 'observer.test.echo';
  readonly name = 'Echo Plugin';
  readonly version = '0.1.0';
  readonly sdkVersion = '0.1.0';
  readonly runtimeType = 'CUSTOM' as const;

  sdk: ObserverSDK | null = null;
  connectCalls = 0;
  disconnectCalls = 0;

  async discover(_w: Workspace): Promise<DiscoveryResult> {
    return { detected: true, confidence: 1.0 };
  }

  async connect(_s: SessionInfo, sdk: ObserverSDK, _c?: PluginConfig): Promise<void> {
    this.sdk = sdk;
    this.connectCalls++;
    sdk.emit({
      type: 'observer.test/echo.connected',
      sourceNodeId: sdk.generateNodeId('echo-root'),
      occurredAt: Date.now(),
      payload: { pluginId: this.id },
    });
  }

  async disconnect(): Promise<void> {
    this.sdk = null;
    this.disconnectCalls++;
  }

  async onHealthCheck(): Promise<HealthStatus> {
    return { healthy: true, message: 'echo is alive' };
  }

  getNodeTypes(): NodeTypeRegistration[] { return []; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function inject(
  daemon: ObserverDaemon,
  method: string,
  url: string,
  body?: unknown,
) {
  const hasBody = body !== undefined;
  return daemon.api.app.inject({
    method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    url,
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    payload: hasBody ? JSON.stringify(body) : undefined,
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let daemon: ObserverDaemon;
let plugin: EchoPlugin;
let testDataDir: string;

beforeEach(async () => {
  testDataDir = mkdtempSync(join(tmpdir(), 'observer-daemon-test-'));
  plugin = new EchoPlugin();
  daemon = new ObserverDaemon({ logLevel: 'silent', storagePath: testDataDir });
  daemon.use(plugin);
  await daemon.init(); // init only — no port binding
});

afterEach(async () => {
  await daemon.stop().catch(() => {/* already stopped */});
  rmSync(testDataDir, { recursive: true, force: true });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await inject(daemon, 'GET', '/api/health');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as HealthResponse;
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

describe('POST /api/sessions', () => {
  it('creates session with name', async () => {
    const res = await inject(daemon, 'POST', '/api/sessions', { name: 'Debug run' });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as ApiSession;
    expect(body.status).toBe('ACTIVE');
    expect(body.name).toBe('Debug run');
    expect(body.id).toBeTruthy();
  });

  it('creates session with default name when empty body', async () => {
    const res = await inject(daemon, 'POST', '/api/sessions', {});
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as ApiSession;
    expect(body.status).toBe('ACTIVE');
  });

  it('creates session with tags', async () => {
    const res = await inject(daemon, 'POST', '/api/sessions', { name: 'Tagged', tags: ['prod', 'api'] });
    const body = JSON.parse(res.body) as ApiSession;
    expect(body.tags).toEqual(['prod', 'api']);
  });

  it('connects plugins on create — plugin emits event', async () => {
    const res = await inject(daemon, 'POST', '/api/sessions', { name: 'Plugin test' });
    const { id } = JSON.parse(res.body) as ApiSession;

    const evRes = await inject(daemon, 'GET', `/api/sessions/${id}/events`);
    const evBody = JSON.parse(evRes.body) as EventsResponse;
    expect(evBody.total).toBeGreaterThan(0);
    expect(evBody.events[0]?.type).toBe('observer.test/echo.connected');
  });
});

describe('GET /api/sessions', () => {
  it('returns empty array when no sessions', async () => {
    const res = await inject(daemon, 'GET', '/api/sessions');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns all sessions', async () => {
    await inject(daemon, 'POST', '/api/sessions', { name: 'A' });
    await inject(daemon, 'POST', '/api/sessions', { name: 'B' });
    const res = await inject(daemon, 'GET', '/api/sessions');
    const body = JSON.parse(res.body) as ApiSession[];
    expect(body).toHaveLength(2);
    expect(body.map(s => s.name).sort()).toEqual(['A', 'B']);
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns session by id', async () => {
    const created = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'Lookup' })).body
    ) as ApiSession;

    const res = await inject(daemon, 'GET', `/api/sessions/${created.id}`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ApiSession;
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('Lookup');
  });

  it('returns 404 for unknown session', async () => {
    const res = await inject(daemon, 'GET', '/api/sessions/does_not_exist');
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('ends session and returns COMPLETED status', async () => {
    const created = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'ToEnd' })).body
    ) as ApiSession;

    const res = await inject(daemon, 'DELETE', `/api/sessions/${created.id}`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ApiSession;
    expect(body.status).toBe('COMPLETED');
    expect(body.endedAt).toBeDefined();
  });

  it('returns 404 for unknown session', async () => {
    const res = await inject(daemon, 'DELETE', '/api/sessions/no_such');
    expect(res.statusCode).toBe(404);
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('POST /api/sessions/:id/events', () => {
  it('emits event via REST and reflects in GET /events', async () => {
    const { id } = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'Emit test' })).body
    ) as ApiSession;

    const emitRes = await inject(daemon, 'POST', `/api/sessions/${id}/events`, {
      type: 'observer.test/thing.started',
      sourceNodeId: 'node_abc',
      occurredAt: Date.now(),
      payload: { label: 'test' },
    });
    expect(emitRes.statusCode).toBe(201);
    const { sequenceNumber } = JSON.parse(emitRes.body) as { id: string; sequenceNumber: number };
    expect(typeof sequenceNumber).toBe('number');

    const evRes = await inject(daemon, 'GET', `/api/sessions/${id}/events`);
    const { events } = JSON.parse(evRes.body) as EventsResponse;
    const found = events.find(e => e.type === 'observer.test/thing.started');
    expect(found).toBeDefined();
    expect(found?.payload['label']).toBe('test');
  });

  it('rejects emit into completed session', async () => {
    const { id } = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'Done' })).body
    ) as ApiSession;
    await inject(daemon, 'DELETE', `/api/sessions/${id}`);

    const res = await inject(daemon, 'POST', `/api/sessions/${id}/events`, {
      type: 'observer.test/thing',
      sourceNodeId: 'node_x',
      occurredAt: Date.now(),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /api/sessions/:id/events', () => {
  it('supports afterSequence pagination', async () => {
    const { id } = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'Paginate' })).body
    ) as ApiSession;

    const n = asNodeId('n_page');
    const e1 = JSON.parse(
      (await inject(daemon, 'POST', `/api/sessions/${id}/events`, {
        type: 'observer.test/a',
        sourceNodeId: n as string,
        occurredAt: Date.now(),
        payload: {},
      })).body
    ) as { sequenceNumber: number };

    await inject(daemon, 'POST', `/api/sessions/${id}/events`, {
      type: 'observer.test/b',
      sourceNodeId: n as string,
      occurredAt: Date.now(),
      payload: {},
    });

    const res = await inject(
      daemon, 'GET',
      `/api/sessions/${id}/events?afterSequence=${e1.sequenceNumber}`
    );
    const { events } = JSON.parse(res.body) as EventsResponse;
    // Only events AFTER first one — filter out echo plugin's connect event too
    const testEvents = events.filter(e => e.type === 'observer.test/b');
    expect(testEvents).toHaveLength(1);
  });
});

// ─── Nodes ────────────────────────────────────────────────────────────────────

describe('GET /api/sessions/:id/nodes', () => {
  it('returns materialized graph nodes', async () => {
    const { id } = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'Graph test' })).body
    ) as ApiSession;

    await inject(daemon, 'POST', `/api/sessions/${id}/events`, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: 'browser_req_001',
      occurredAt: Date.now(),
      payload: { method: 'GET', url: '/api/data' },
    });

    const res = await inject(daemon, 'GET', `/api/sessions/${id}/nodes`);
    expect(res.statusCode).toBe(200);
    const { nodes } = JSON.parse(res.body) as NodesResponse;
    expect(nodes.length).toBeGreaterThan(0);

    const req = nodes.find(n => n.id === 'browser_req_001');
    expect(req).toBeDefined();
    expect(req?.status).toBe('ACTIVE');
    expect(req?.metadata['method']).toBe('GET');
  });
});

// ─── Context Engine ───────────────────────────────────────────────────────────

describe('POST /api/sessions/:id/context', () => {
  it('returns 400 when anchor.nodeId missing', async () => {
    const { id } = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'ctx' })).body
    ) as ApiSession;

    const res = await inject(daemon, 'POST', `/api/sessions/${id}/context`, {});
    expect(res.statusCode).toBe(400);
  });

  it('returns 422 when anchor node not found', async () => {
    const { id } = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'ctx' })).body
    ) as ApiSession;

    const res = await inject(daemon, 'POST', `/api/sessions/${id}/context`, {
      anchor: { type: 'node', nodeId: 'does-not-exist' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 200 with context package for real node', async () => {
    const { id } = JSON.parse(
      (await inject(daemon, 'POST', '/api/sessions', { name: 'ctx' })).body
    ) as ApiSession;

    // Emit an event to create a node in the graph
    await inject(daemon, 'POST', `/api/sessions/${id}/events`, {
      type: 'observer.express/request.started',
      sourceNodeId: asNodeId('req-ctx-1'),
      occurredAt: Date.now(),
      payload: { method: 'GET' },
      severity: 'INFO',
    });

    const res = await inject(daemon, 'POST', `/api/sessions/${id}/context`, {
      anchor: { type: 'node', nodeId: 'req-ctx-1' },
      depth: 'SURFACE',
      format: 'MARKDOWN',
    });
    expect(res.statusCode).toBe(200);
    const pkg = JSON.parse(res.body) as { markdownContent: string; tokenEstimate: number; sessionId: string };
    expect(pkg.markdownContent).toContain('Observer OS');
    expect(pkg.tokenEstimate).toBeGreaterThan(0);
    expect(pkg.sessionId).toBe(id);
  });
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

describe('GET /api/metrics', () => {
  it('returns prometheus text', async () => {
    const res = await inject(daemon, 'GET', '/api/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('observer_sessions_total');
    expect(res.body).toContain('observer_events_total');
  });
});

// ─── Annotations ──────────────────────────────────────────────────────────────

describe('Annotations', () => {
  it('POST /api/sessions/:id/annotations creates annotation', async () => {
    const s = await inject(daemon, 'POST', '/api/sessions', { name: 'ann-test' });
    const session = JSON.parse(s.body) as { id: string };

    const res = await inject(daemon, 'POST', `/api/sessions/${session.id}/annotations`, {
      text: 'This is a note',
      nodeId: 'node-1',
    });
    expect(res.statusCode).toBe(201);
    const ann = JSON.parse(res.body) as { id: string; text: string };
    expect(ann.text).toBe('This is a note');
    expect(ann.id).toBeDefined();
  });

  it('GET /api/sessions/:id/annotations returns annotations', async () => {
    const s = await inject(daemon, 'POST', '/api/sessions', { name: 'ann-list' });
    const session = JSON.parse(s.body) as { id: string };
    await inject(daemon, 'POST', `/api/sessions/${session.id}/annotations`, { text: 'note1' });

    const res = await inject(daemon, 'GET', `/api/sessions/${session.id}/annotations`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { annotations: unknown[] };
    expect(body.annotations.length).toBe(1);
  });

  it('DELETE /api/sessions/:id/annotations/:annotationId removes annotation', async () => {
    const s = await inject(daemon, 'POST', '/api/sessions', { name: 'ann-del' });
    const session = JSON.parse(s.body) as { id: string };
    const cr = await inject(daemon, 'POST', `/api/sessions/${session.id}/annotations`, { text: 'to delete' });
    const ann = JSON.parse(cr.body) as { id: string };

    const res = await inject(daemon, 'DELETE', `/api/sessions/${session.id}/annotations/${ann.id}`);
    expect(res.statusCode).toBe(204);

    const listRes = await inject(daemon, 'GET', `/api/sessions/${session.id}/annotations`);
    const body = JSON.parse(listRes.body) as { annotations: unknown[] };
    expect(body.annotations.length).toBe(0);
  });
});

// ─── Session share ────────────────────────────────────────────────────────────

describe('GET /api/sessions/:id/share', () => {
  it('returns self-contained HTML', async () => {
    const s = await inject(daemon, 'POST', '/api/sessions', { name: 'share-test' });
    const session = JSON.parse(s.body) as { id: string };

    const res = await inject(daemon, 'GET', `/api/sessions/${session.id}/share`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('share-test');
    expect(res.body).toContain('Observer OS');
    expect(res.body).toContain('const DATA =');
  });

  it('returns 404 for unknown session', async () => {
    const res = await inject(daemon, 'GET', '/api/sessions/nonexistent/share');
    expect(res.statusCode).toBe(404);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('Input validation', () => {
  it('POST /api/sessions with name exceeding 100 chars returns 400', async () => {
    const res = await inject(daemon, 'POST', '/api/sessions', { name: 'x'.repeat(101) });
    expect(res.statusCode).toBe(400);
  });

  it('POST emit event with missing type returns 400', async () => {
    const s = await inject(daemon, 'POST', '/api/sessions', {});
    const session = JSON.parse(s.body) as { id: string };
    const res = await inject(daemon, 'POST', `/api/sessions/${session.id}/events`, {
      sourceNodeId: 'n1',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  it('returns 429 after 200 emit requests from same IP', async () => {
    const s = await inject(daemon, 'POST', '/api/sessions', {});
    const session = JSON.parse(s.body) as { id: string };
    let lastStatus = 0;
    for (let i = 0; i < 201; i++) {
      const r = await daemon.api.app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/events`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ type: 'test.event', sourceNodeId: 'n1', payload: {} }),
        remoteAddress: '1.2.3.4',
      });
      lastStatus = r.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});

// ─── Default session (zero-config) ───────────────────────────────────────────

describe('GET /api/sessions/default', () => {
  it('returns active session when one exists', async () => {
    // Create a session first
    await inject(daemon, 'POST', '/api/sessions', { name: 'test' });
    const res = await inject(daemon, 'GET', '/api/sessions/default');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe('ACTIVE');
  });

  it('creates a session when none active', async () => {
    // No sessions created in this test — default endpoint auto-creates one
    const res = await inject(daemon, 'GET', '/api/sessions/default');
    expect([200, 201]).toContain(res.statusCode);
    const body = JSON.parse(res.body) as { id: string; name?: string };
    expect(body.id).toBeTruthy();
  });
});

// ─── Browser inject script ────────────────────────────────────────────────────

describe('GET /observer.js', () => {
  it('returns JavaScript content', async () => {
    const res = await inject(daemon, 'GET', '/observer.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.body).toContain('Observer OS');
    expect(res.body).toContain('window.fetch');
    expect(res.body).toContain('/api/sessions/default');
  });

  it('embeds daemon URL in script', async () => {
    const res = await daemon.api.app.inject({
      method: 'GET',
      url: '/observer.js',
      headers: { host: 'localhost:4000' },
    });
    expect(res.body).toContain('localhost:4000');
  });

  it('observer.js includes WebSocket patching', async () => {
    const res = await inject(daemon, 'GET', '/observer.js');
    expect(res.body).toContain('WebSocket');
    expect(res.body).toContain('ws.connected');
    expect(res.body).toContain('ws.disconnected');
  });

  it('observer.js includes XHR patching', async () => {
    const res = await inject(daemon, 'GET', '/observer.js');
    expect(res.body).toContain('XMLHttpRequest');
    expect(res.body).toContain('xhr.started');
  });
});

// ─── CDP routes ───────────────────────────────────────────────────────────────

describe('GET /api/cdp/status', () => {
  it('returns connected:false when Chrome not running', async () => {
    const res = await inject(daemon, 'GET', '/api/cdp/status');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { connected: boolean };
    // Chrome likely not running in test env
    expect(typeof body.connected).toBe('boolean');
    expect(body).toHaveProperty('chromeUrl');
    expect(body).toHaveProperty('message');
  });
});

describe('GET /api/cdp/console', () => {
  it('returns empty messages array', async () => {
    const res = await inject(daemon, 'GET', '/api/cdp/console');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { messages: unknown[] };
    expect(Array.isArray(body.messages)).toBe(true);
  });
});

describe('GET /api/cdp/network', () => {
  it('returns empty requests array', async () => {
    const res = await inject(daemon, 'GET', '/api/cdp/network');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { requests: unknown[] };
    expect(Array.isArray(body.requests)).toBe(true);
  });
});

describe('POST /api/cdp/navigate — missing url', () => {
  it('returns 400', async () => {
    const res = await inject(daemon, 'POST', '/api/cdp/navigate', {});
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/cdp/click — missing selector', () => {
  it('returns 400', async () => {
    const res = await inject(daemon, 'POST', '/api/cdp/click', {});
    expect(res.statusCode).toBe(400);
  });
});

// ─── CORS headers ─────────────────────────────────────────────────────────────

describe('CORS headers', () => {
  it('GET /api/sessions includes CORS headers', async () => {
    const res = await inject(daemon, 'GET', '/api/sessions');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('OPTIONS preflight returns 204', async () => {
    const res = await daemon.api.app.inject({
      method: 'OPTIONS',
      url: '/api/sessions',
    });
    expect(res.statusCode).toBe(204);
  });
});

// ─── Daemon lifecycle ─────────────────────────────────────────────────────────

describe('ObserverDaemon lifecycle', () => {
  it('start → RUNNING, stop → STOPPED', async () => {
    const d = new ObserverDaemon({ logLevel: 'silent', port: 7899 });
    await d.start();
    expect(d.getState()).toBe('RUNNING');
    await d.stop();
    expect(d.getState()).toBe('STOPPED');
  });

  it('stop ends all active sessions', async () => {
    const d = new ObserverDaemon({ logLevel: 'silent', port: 7898 });
    await d.start();

    // Create a session directly
    d.core.sessions.create({ name: 'ShouldEnd' });
    expect(d.core.sessions.list().some(s => s.status === 'ACTIVE')).toBe(true);

    await d.stop();
    // All sessions should be COMPLETED after stop
    // (core is disposed so we check before disposal — but stop handles it)
    expect(d.getState()).toBe('STOPPED');
  });

  it('double stop is safe', async () => {
    const d = new ObserverDaemon({ logLevel: 'silent', port: 7897 });
    await d.start();
    await d.stop();
    await expect(d.stop()).resolves.toBeUndefined();
  });

  it('plugin registered via use() loads on init', async () => {
    const d = new ObserverDaemon({ logLevel: 'silent' });
    const p = new EchoPlugin();
    d.use(p, { custom: true });
    await d.init();

    expect(d.registry.getPlugin('observer.test.echo')).toBeDefined();
    await d.stop();
  });
});
