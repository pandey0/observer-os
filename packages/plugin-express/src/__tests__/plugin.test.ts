import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Express } from 'express';
import { createCore, asWorkspaceId, asNodeId } from '@observer-os/core';
import type { ObserverCore } from '@observer-os/core';
import { PluginRegistry, PluginSDKImpl } from '@observer-os/sdk';
import type { SessionInfo } from '@observer-os/sdk';
import { ExpressObserverPlugin } from '../ExpressObserverPlugin.js';
import { createRequestMiddleware, createErrorMiddleware } from '../middleware/observerMiddleware.js';
import { EXPRESS_NODE_TYPES, EXPRESS_EVENTS } from '../node-types.js';

const WS = asWorkspaceId('ws_express_test');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCore() {
  const core = createCore(WS);
  const session = core.sessions.create({ name: 'Express test' });
  const info: SessionInfo = {
    id: session.id,
    workspaceId: session.workspaceId,
    name: session.name,
    startedAt: session.startedAt,
  };
  const sdk = new PluginSDKImpl(core.sessions, info, 'observer.express', {});
  sdk.markConnected();
  return { core, session, sdk };
}

// Build a test Express app instrumented with observer middleware
function makeApp(sdk: InstanceType<typeof PluginSDKImpl>): Express {
  const app = express();
  app.use(express.json());
  app.use(createRequestMiddleware(sdk));

  app.get('/api/users', (_req, res) => {
    res.json([{ id: 1, name: 'Alice' }]);
  });

  app.get('/api/users/:id', (req, res) => {
    res.json({ id: req.params['id'], name: 'Alice' });
  });

  app.post('/api/users', (req, res) => {
    res.status(201).json({ id: 2, ...req.body });
  });

  app.get('/api/not-found', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.get('/api/error', () => {
    throw new Error('Boom');
  });

  // Error handler
  app.use(createErrorMiddleware(sdk));
  app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

// ─── Plugin contract tests ─────────────────────────────────────────────────

describe('ExpressObserverPlugin — interface contract', () => {
  it('implements ObserverPlugin correctly', () => {
    const plugin = new ExpressObserverPlugin();
    expect(plugin.id).toBe('observer.express');
    expect(plugin.name).toBe('Express Observer');
    expect(plugin.runtimeType).toBe('EXPRESS');
    expect(typeof plugin.discover).toBe('function');
    expect(typeof plugin.connect).toBe('function');
    expect(typeof plugin.disconnect).toBe('function');
    expect(typeof plugin.getNodeTypes).toBe('function');
    expect(typeof plugin.middleware).toBe('function');
    expect(typeof plugin.errorMiddleware).toBe('function');
  });

  it('discover returns detected=true when express available', async () => {
    const plugin = new ExpressObserverPlugin();
    const result = await plugin.discover({ id: WS, rootPath: '/app', name: 'test' });
    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('getNodeTypes returns 4 express node types', () => {
    const plugin = new ExpressObserverPlugin();
    const types = plugin.getNodeTypes();
    expect(types).toHaveLength(4);
    const ids = types.map(t => t.type);
    expect(ids).toContain('observer.express/HttpServer');
    expect(ids).toContain('observer.express/Request');
    expect(ids).toContain('observer.express/Route');
    expect(ids).toContain('observer.express/ErrorHandler');
  });

  it('healthCheck before connect reports unhealthy', async () => {
    const plugin = new ExpressObserverPlugin();
    const health = await plugin.onHealthCheck!();
    expect(health.healthy).toBe(false);
  });

  it('middleware() no-ops before connect', async () => {
    const plugin = new ExpressObserverPlugin();
    const app = express();
    app.use(plugin.middleware());
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/ping');
    expect(res.status).toBe(200); // no crash — middleware no-oped
  });
});

// ─── Plugin lifecycle tests ────────────────────────────────────────────────

describe('ExpressObserverPlugin — lifecycle via PluginRegistry', () => {
  let core: ObserverCore;
  let registry: PluginRegistry;
  let plugin: ExpressObserverPlugin;

  beforeEach(() => {
    core = createCore(WS);
    registry = new PluginRegistry(core.sessions);
    plugin = new ExpressObserverPlugin();
    registry.register(plugin);
  });

  afterEach(async () => {
    await registry.disconnectAll();
    core.dispose();
  });

  it('connect → healthCheck reports healthy', async () => {
    const session = core.sessions.create({ name: 'Express lifecycle' });
    await registry.connect('observer.express', session);

    const health = await plugin.onHealthCheck!();
    expect(health.healthy).toBe(true);
  });

  it('disconnect → healthCheck reports unhealthy', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.express', session);
    await registry.disconnect('observer.express');

    const health = await plugin.onHealthCheck!();
    expect(health.healthy).toBe(false);
  });

  it('middleware no-ops after disconnect', async () => {
    const session = core.sessions.create();
    await registry.connect('observer.express', session);
    await registry.disconnect('observer.express');

    const app = express();
    app.use(plugin.middleware());
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/ping');
    expect(res.status).toBe(200); // still works, just not instrumented
    expect(core.events.read(session.id)).toHaveLength(0);
  });
});

// ─── Middleware event emission tests ──────────────────────────────────────

describe('createRequestMiddleware — event emission', () => {
  let core: ObserverCore;
  let app: Express;

  beforeEach(() => {
    const ctx = makeCore();
    core = ctx.core;
    app = makeApp(ctx.sdk);
  });

  afterEach(() => {
    core.dispose();
  });

  it('emits REQUEST_STARTED on GET', async () => {
    await request(app).get('/api/users');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);

    expect(started).toBeDefined();
    expect(started?.payload['method']).toBe('GET');
    expect(started?.payload['path']).toBe('/api/users');
  });

  it('emits REQUEST_COMPLETED on 200', async () => {
    await request(app).get('/api/users');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const completed = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_COMPLETED);

    expect(completed).toBeDefined();
    expect(completed?.payload['statusCode']).toBe(200);
    expect(completed?.severity).toBe('INFO');
    expect(typeof completed?.payload['duration']).toBe('number');
  });

  it('emits REQUEST_STARTED then REQUEST_COMPLETED in order', async () => {
    await request(app).get('/api/users');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const types = events.map(e => e.type);
    const startIdx = types.indexOf(EXPRESS_EVENTS.REQUEST_STARTED);
    const endIdx   = types.indexOf(EXPRESS_EVENTS.REQUEST_COMPLETED);

    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(startIdx);
  });

  it('severity WARN on 4xx', async () => {
    await request(app).get('/api/not-found');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const completed = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_COMPLETED);

    expect(completed?.severity).toBe('WARN');
    expect(completed?.payload['statusCode']).toBe(404);
  });

  it('emits REQUEST_FAILED + severity ERROR on 5xx', async () => {
    await request(app).get('/api/error');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const failed = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_FAILED);

    expect(failed).toBeDefined();
    expect(failed?.severity).toBe('ERROR');
    expect(failed?.payload['statusCode']).toBe(500);
  });

  it('emits ERROR_CAUGHT for thrown errors', async () => {
    await request(app).get('/api/error');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const caught = events.find(e => e.type === EXPRESS_EVENTS.ERROR_CAUGHT);

    expect(caught).toBeDefined();
    expect(caught?.payload['message']).toBe('Boom');
    expect(caught?.severity).toBe('ERROR');
  });

  it('sets correlationId from X-Observer-Trace-Id header', async () => {
    await request(app)
      .get('/api/users')
      .set('X-Observer-Trace-Id', 'trace_abc123');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);

    expect(started?.correlationId).toBe('trace_abc123');
  });

  it('REQUEST_COMPLETED also carries correlationId from header', async () => {
    await request(app)
      .get('/api/users')
      .set('X-Observer-Trace-Id', 'trace_xyz');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const completed = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_COMPLETED);

    expect(completed?.correlationId).toBe('trace_xyz');
  });

  it('no correlationId when header absent', async () => {
    await request(app).get('/api/users');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);

    expect(started?.correlationId).toBeUndefined();
  });

  it('W3C traceparent header sets correlationId to traceId', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const spanId = '00f067aa0ba902b7';

    await request(app)
      .get('/api/users')
      .set('traceparent', `00-${traceId}-${spanId}-01`);

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);

    expect(started?.correlationId).toBe(traceId);
  });

  it('traceparent traceId and parentId appear in REQUEST_STARTED payload', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const spanId = '00f067aa0ba902b7';

    await request(app)
      .get('/api/users')
      .set('traceparent', `00-${traceId}-${spanId}-01`);

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);

    expect(started?.payload['traceId']).toBe(traceId);
    expect(started?.payload['parentId']).toBe(spanId);
  });

  it('traceparent takes priority over x-observer-trace-id', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';

    await request(app)
      .get('/api/users')
      .set('traceparent', `00-${traceId}-00f067aa0ba902b7-01`)
      .set('X-Observer-Trace-Id', 'legacy-id-should-be-ignored');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);

    expect(started?.correlationId).toBe(traceId);
  });

  it('redacts Authorization header', async () => {
    await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer supersecret');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);
    const headers = started?.payload['headers'] as Record<string, unknown>;

    expect(headers?.['authorization']).toBe('[REDACTED]');
  });

  it('redacts cookie header', async () => {
    await request(app)
      .get('/api/users')
      .set('Cookie', 'session=abc123');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);
    const headers = started?.payload['headers'] as Record<string, unknown>;

    expect(headers?.['cookie']).toBe('[REDACTED]');
  });

  it('two concurrent requests get distinct nodeIds', async () => {
    await Promise.all([
      request(app).get('/api/users'),
      request(app).get('/api/users'),
    ]);

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.filter(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);
    const nodeIds = started.map(e => e.sourceNodeId);

    expect(started).toHaveLength(2);
    expect(nodeIds[0]).toBeDefined();
    expect(nodeIds[0]).not.toBe(nodeIds[1]);
  });

  it('emits route pattern in REQUEST_COMPLETED payload', async () => {
    await request(app).get('/api/users/42');

    const events = core.events.read(core.sessions.list()[0]!.id);
    const completed = events.find(
      e => e.type === EXPRESS_EVENTS.REQUEST_COMPLETED && e.payload['path'] === '/api/users/42',
    );

    // route pattern should be /api/users/:id
    expect(completed?.payload['route']).toBe('/api/users/:id');
    expect(completed?.payload['path']).toBe('/api/users/42');
  });

  it('materializes request node in graph', async () => {
    await request(app).get('/api/users');

    const session = core.sessions.list()[0]!;
    const nodes = core.graph.getNodes(session.id);

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some(n => n.domain === 'express')).toBe(true);
  });

  it('POST request captured with correct method', async () => {
    await request(app)
      .post('/api/users')
      .send({ name: 'Bob' });

    const events = core.events.read(core.sessions.list()[0]!.id);
    const started = events.find(e => e.type === EXPRESS_EVENTS.REQUEST_STARTED);

    expect(started?.payload['method']).toBe('POST');
  });
});

// ─── Cross-domain correlation tests ──────────────────────────────────────

describe('Cross-domain correlation — browser fetch → express route', () => {
  it('forms CORRELATED_WITH edge between browser and express nodes', async () => {
    const { core, session, sdk } = makeCore();

    const correlationId = 'trace_fullstack_001';
    const browserNodeId = asNodeId('browser_fetch_001');

    // Browser emits fetch started
    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: browserNodeId,
      occurredAt: Date.now(),
      correlationId,
      payload: { method: 'GET', url: '/api/users' },
    });

    // Express receives request with same correlationId
    const expressNodeId = sdk.generateNodeId('request:1');
    core.sessions.emit(session.id, {
      type: EXPRESS_EVENTS.REQUEST_STARTED,
      sourceNodeId: expressNodeId,
      occurredAt: Date.now(),
      correlationId,
      payload: { method: 'GET', path: '/api/users' },
    });

    const browserNode = core.graph.getNode(browserNodeId as string);
    expect(browserNode?.relationships.some(
      r => r.type === 'CORRELATED_WITH' && r.target === expressNodeId,
    )).toBe(true);

    core.dispose();
  });
});

// ─── Node type schema tests ────────────────────────────────────────────────

describe('EXPRESS_NODE_TYPES', () => {
  it('all types have required fields', () => {
    for (const t of EXPRESS_NODE_TYPES) {
      expect(t.type.startsWith('observer.express/')).toBe(true);
      expect(typeof t.displayName).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.schemaVersion).toBe('string');
      expect(Array.isArray(t.capabilities)).toBe(true);
      expect(t.domainId).toBe('express');
    }
  });
});
