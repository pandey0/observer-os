import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCore, asNodeId, asWorkspaceId } from '../index.js';
import type { ObserverCore } from '../index.js';

const WS = asWorkspaceId('ws_test');

describe('Observer Core — Event Log', () => {
  let core: ObserverCore;

  beforeEach(() => { core = createCore(WS); });
  afterEach(() => { core.dispose(); });

  it('appends events and reads them back in order', () => {
    const session = core.sessions.create({ name: 'test' });
    const nodeId = asNodeId('node_a');

    core.sessions.emit(session.id, {
      type: 'observer.test/thing.started',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { label: 'first' },
    });
    core.sessions.emit(session.id, {
      type: 'observer.test/thing.completed',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { label: 'second' },
    });

    const events = core.events.read(session.id);
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('observer.test/thing.started');
    expect(events[1]?.type).toBe('observer.test/thing.completed');
  });

  it('assigns globally monotonic sequence numbers', () => {
    const s1 = core.sessions.create();
    const s2 = core.sessions.create();
    const n = asNodeId('n');

    const e1 = core.sessions.emit(s1.id, { type: 'observer.test/a', sourceNodeId: n, occurredAt: Date.now(), payload: {} });
    const e2 = core.sessions.emit(s2.id, { type: 'observer.test/b', sourceNodeId: n, occurredAt: Date.now(), payload: {} });
    const e3 = core.sessions.emit(s1.id, { type: 'observer.test/c', sourceNodeId: n, occurredAt: Date.now(), payload: {} });

    expect(e1.sequenceNumber).toBeLessThan(e2.sequenceNumber);
    expect(e2.sequenceNumber).toBeLessThan(e3.sequenceNumber);
  });

  it('events are immutable after recording', () => {
    const session = core.sessions.create();
    const event = core.sessions.emit(session.id, {
      type: 'observer.test/thing.started',
      sourceNodeId: asNodeId('n'),
      occurredAt: Date.now(),
      payload: { value: 1 },
    });

    // Events are frozen — mutation throws in strict mode (Node ESM is always strict)
    expect(() => {
      // @ts-expect-error: testing runtime immutability
      (event as Record<string, unknown>)['type'] = 'hacked';
    }).toThrow(TypeError);

    // Stored event unaffected
    const stored = core.events.read(session.id)[0];
    expect(stored?.type).toBe('observer.test/thing.started');
  });

  it('filters events by sequenceNumber', () => {
    const session = core.sessions.create();
    const n = asNodeId('n');
    const e1 = core.sessions.emit(session.id, { type: 'observer.test/a', sourceNodeId: n, occurredAt: Date.now(), payload: {} });
    core.sessions.emit(session.id, { type: 'observer.test/b', sourceNodeId: n, occurredAt: Date.now(), payload: {} });

    const after = core.events.read(session.id, { afterSequence: e1.sequenceNumber });
    expect(after).toHaveLength(1);
    expect(after[0]?.type).toBe('observer.test/b');
  });
});

describe('Observer Core — Projection Engine (push path)', () => {
  let core: ObserverCore;

  beforeEach(() => { core = createCore(WS); });
  afterEach(() => { core.dispose(); });

  it('materializes a node from the first event', () => {
    const session = core.sessions.create();
    const nodeId = asNodeId('browser_req_001');

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { method: 'POST', url: '/api/orders' },
    });

    const node = core.graph.getNode(nodeId);
    expect(node).toBeDefined();
    expect(node?.id).toBe(nodeId);
    expect(node?.status).toBe('ACTIVE');
    expect(node?.metadata['method']).toBe('POST');
    expect(node?.metadata['url']).toBe('/api/orders');
    expect(node?.version).toBe(1);
  });

  it('updates node status on terminal event', () => {
    const session = core.sessions.create();
    const nodeId = asNodeId('browser_req_002');

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { method: 'GET', url: '/api/users' },
    });

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.completed',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { status: 200, duration: 142 },
    });

    const node = core.graph.getNode(nodeId);
    expect(node?.status).toBe('COMPLETED');
    expect(node?.version).toBe(2);
    expect(node?.metadata['status']).toBe(200);
  });

  it('marks node FAILED on failure event', () => {
    const session = core.sessions.create();
    const nodeId = asNodeId('browser_req_003');

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { method: 'POST', url: '/api/order' },
    });

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.failed',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { error: 'NetworkError', message: 'Failed to fetch' },
    });

    const node = core.graph.getNode(nodeId);
    expect(node?.status).toBe('FAILED');
  });

  it('forms CORRELATED_WITH edge across domains', () => {
    const session = core.sessions.create();
    const browserNodeId = asNodeId('browser_fetch_001');
    const backendNodeId = asNodeId('backend_route_001');
    const correlationId = 'trace_abc123';

    // Browser emits fetch event
    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: browserNodeId,
      occurredAt: Date.now(),
      payload: { method: 'POST', url: '/api/orders' },
      correlationId,
    });

    // Backend emits route event with same correlationId
    core.sessions.emit(session.id, {
      type: 'observer.nodejs/backend.request.received',
      sourceNodeId: backendNodeId,
      occurredAt: Date.now(),
      payload: { path: '/api/orders', method: 'POST' },
      correlationId,
    });

    const browserNode = core.graph.getNode(browserNodeId);
    expect(browserNode).toBeDefined();

    const hasCorrelation = browserNode?.relationships.some(
      r => r.type === 'CORRELATED_WITH' && r.target === backendNodeId
    );
    expect(hasCorrelation).toBe(true);
  });

  it('returns all nodes for a session', () => {
    const session = core.sessions.create();

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: asNodeId('n1'),
      occurredAt: Date.now(),
      payload: {},
    });
    core.sessions.emit(session.id, {
      type: 'observer.browser/console.log',
      sourceNodeId: asNodeId('n2'),
      occurredAt: Date.now(),
      payload: { message: 'hello' },
    });

    const nodes = core.graph.getNodes(session.id);
    expect(nodes).toHaveLength(2);
  });

  it('notifies subscribers on node change', () => {
    const session = core.sessions.create();
    const changes: string[] = [];

    const unsub = core.graph.onNodeChange(node => {
      changes.push(node.id as string);
    });

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: asNodeId('n1'),
      occurredAt: Date.now(),
      payload: {},
    });

    unsub();

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.completed',
      sourceNodeId: asNodeId('n1'),
      occurredAt: Date.now(),
      payload: {},
    });

    // Only the first event should appear (unsub called before second emit)
    expect(changes).toHaveLength(1);
  });
});

describe('Observer Core — Session Engine', () => {
  let core: ObserverCore;

  beforeEach(() => { core = createCore(WS); });
  afterEach(() => { core.dispose(); });

  it('creates a session with ACTIVE status', () => {
    const session = core.sessions.create({ name: 'My Debug Session' });
    expect(session.status).toBe('ACTIVE');
    expect(session.name).toBe('My Debug Session');
    expect(session.id).toMatch(/^ses_/);
    expect(session.workspaceId).toBe(WS);
  });

  it('tracks event count per session', () => {
    const session = core.sessions.create();
    const n = asNodeId('n');

    core.sessions.emit(session.id, { type: 'observer.test/a', sourceNodeId: n, occurredAt: Date.now(), payload: {} });
    core.sessions.emit(session.id, { type: 'observer.test/b', sourceNodeId: n, occurredAt: Date.now(), payload: {} });

    const current = core.sessions.get(session.id);
    expect(current?.eventCount).toBe(2);
  });

  it('ends a session and marks it COMPLETED', () => {
    const session = core.sessions.create();
    const completed = core.sessions.end(session.id);

    expect(completed.status).toBe('COMPLETED');
    expect(completed.endedAt).toBeDefined();
  });

  it('rejects emit into a completed session', () => {
    const session = core.sessions.create();
    core.sessions.end(session.id);

    expect(() => {
      core.sessions.emit(session.id, {
        type: 'observer.test/a',
        sourceNodeId: asNodeId('n'),
        occurredAt: Date.now(),
        payload: {},
      });
    }).toThrow();
  });

  it('pauses and resumes a session', () => {
    const session = core.sessions.create();
    const paused = core.sessions.pause(session.id);
    expect(paused.status).toBe('PAUSED');
    expect(paused.pausedAt).toBeDefined();

    const resumed = core.sessions.resume(session.id);
    expect(resumed.status).toBe('ACTIVE');
  });

  it('lists sessions for a workspace', () => {
    core.sessions.create({ name: 'A' });
    core.sessions.create({ name: 'B' });

    const all = core.sessions.list(WS);
    expect(all.length).toBe(2);
    expect(all.map(s => s.name).sort()).toEqual(['A', 'B']);
  });
});

describe('Observer Core — Replay (pull path)', () => {
  let core: ObserverCore;

  beforeEach(() => { core = createCore(WS); });
  afterEach(() => { core.dispose(); });

  it('reconstructs graph from event log replay', () => {
    const session = core.sessions.create();
    const nodeId = asNodeId('replay_node_001');

    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { method: 'GET', url: '/api/ping' },
    });
    core.sessions.emit(session.id, {
      type: 'observer.browser/network.request.completed',
      sourceNodeId: nodeId,
      occurredAt: Date.now(),
      payload: { status: 200 },
    });

    core.sessions.end(session.id);

    // Create a new core instance — fresh graph
    const core2 = createCore(WS);

    // Copy events from original event log into new one for replay
    const events = core.events.read(session.id);
    for (const event of events) {
      core2.events.append(session.id, WS, {
        type: event.type,
        sourceNodeId: event.sourceNodeId,
        occurredAt: event.occurredAt,
        payload: event.payload as Record<string, unknown>,
      });
    }

    // Replay into projection engine
    core2.graph.replay(session.id);

    const replayed = core2.graph.getNode(nodeId);
    expect(replayed?.status).toBe('COMPLETED');
    expect(replayed?.metadata['status']).toBe(200);

    core2.dispose();
  });
});
