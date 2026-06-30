import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PersistenceManager } from '../persistence/PersistenceManager.js';
import { createCore, loadCore } from '../index.js';
import { asWorkspaceId, asNodeId } from '../types/ids.js';
import type { Session } from '../types/session.js';
import type { RuntimeEvent } from '../types/event.js';

const WS = asWorkspaceId('ws_persist_test');

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'observer-test-'));
}

// ─── PersistenceManager unit tests ────────────────────────────────────────────

describe('PersistenceManager — write', () => {
  let dir: string;
  let pm: PersistenceManager;

  beforeEach(() => {
    dir = makeTmpDir();
    pm = new PersistenceManager(dir);
    pm.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('init() creates sessions directory', () => {
    expect(existsSync(join(dir, 'sessions'))).toBe(true);
  });

  it('writeSession() creates session.json', () => {
    const session: Session = {
      id: 'ses_abc' as ReturnType<typeof import('../types/ids.js').asSessionId>,
      workspaceId: WS,
      name: 'Test session',
      status: 'ACTIVE',
      startedAt: 1000,
      tags: [],
      eventCount: 0,
      nodeCount: 0,
    };
    pm.writeSession(session);

    const file = join(dir, 'sessions', 'ses_abc', 'session.json');
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Session;
    expect(parsed.id).toBe('ses_abc');
    expect(parsed.name).toBe('Test session');
    expect(parsed.status).toBe('ACTIVE');
  });

  it('writeEvent() creates events.ndjson', () => {
    const event = makeEvent('ses_xyz', 1);
    pm.writeEvent(event);

    const file = join(dir, 'sessions', 'ses_xyz', 'events.ndjson');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as RuntimeEvent;
    expect(parsed.id).toBe(event.id);
    expect(parsed.type).toBe(event.type);
  });

  it('writeEvent() appends multiple events as separate NDJSON lines', () => {
    const e1 = makeEvent('ses_multi', 1);
    const e2 = makeEvent('ses_multi', 2);
    pm.writeEvent(e1);
    pm.writeEvent(e2);

    const file = join(dir, 'sessions', 'ses_multi', 'events.ndjson');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).sequenceNumber).toBe(1);
    expect(JSON.parse(lines[1]!).sequenceNumber).toBe(2);
  });

  it('writeSession() is atomic — no partial session.json on disk', () => {
    const session: Session = {
      id: 'ses_atomic' as ReturnType<typeof import('../types/ids.js').asSessionId>,
      workspaceId: WS,
      name: 'Atomic test',
      status: 'ACTIVE',
      startedAt: 1000,
      tags: [],
      eventCount: 0,
      nodeCount: 0,
    };
    pm.writeSession(session);
    // Overwrite with updated status
    pm.writeSession({ ...session, status: 'COMPLETED', endedAt: 2000 });

    const file = join(dir, 'sessions', 'ses_atomic', 'session.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Session;
    expect(parsed.status).toBe('COMPLETED');
    // Tmp file should not remain
    expect(existsSync(file + '.tmp')).toBe(false);
  });
});

describe('PersistenceManager — loadAll', () => {
  let dir: string;
  let pm: PersistenceManager;

  beforeEach(() => {
    dir = makeTmpDir();
    pm = new PersistenceManager(dir);
    pm.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty when no sessions exist', () => {
    const { sessions, eventsBySession } = pm.loadAll();
    expect(sessions).toHaveLength(0);
    expect(eventsBySession.size).toBe(0);
  });

  it('loads a written session', () => {
    const session = makeSession('ses_load1', 1000);
    pm.writeSession(session);

    const { sessions } = pm.loadAll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe('ses_load1');
    expect(sessions[0]!.name).toBe('Test session ses_load1');
  });

  it('loads events for a session', () => {
    const session = makeSession('ses_evts', 1000);
    pm.writeSession(session);
    pm.writeEvent(makeEvent('ses_evts', 1));
    pm.writeEvent(makeEvent('ses_evts', 2));
    pm.writeEvent(makeEvent('ses_evts', 3));

    const { eventsBySession } = pm.loadAll();
    const events = eventsBySession.get('ses_evts')!;
    expect(events).toHaveLength(3);
    expect(events.map(e => e.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it('loads multiple sessions sorted by startedAt', () => {
    pm.writeSession(makeSession('ses_b', 2000));
    pm.writeSession(makeSession('ses_a', 1000));
    pm.writeSession(makeSession('ses_c', 3000));

    const { sessions } = pm.loadAll();
    expect(sessions.map(s => s.id)).toEqual(['ses_a', 'ses_b', 'ses_c']);
  });

  it('skips corrupted session.json', () => {
    pm.writeSession(makeSession('ses_good', 1000));
    // Write a bad session dir manually
    mkdirSync(join(dir, 'sessions', 'ses_bad'), { recursive: true });
    writeFileSync(join(dir, 'sessions', 'ses_bad', 'session.json'), 'NOT JSON', 'utf8');

    const { sessions } = pm.loadAll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe('ses_good');
  });

  it('skips corrupted NDJSON lines but loads valid ones', () => {
    const session = makeSession('ses_corrupt', 1000);
    pm.writeSession(session);
    pm.writeEvent(makeEvent('ses_corrupt', 1));
    // Append a corrupted line
    appendFileSync(join(dir, 'sessions', 'ses_corrupt', 'events.ndjson'), 'INVALID\n', 'utf8');
    pm.writeEvent(makeEvent('ses_corrupt', 3));

    const { eventsBySession } = pm.loadAll();
    const events = eventsBySession.get('ses_corrupt')!;
    expect(events).toHaveLength(2);
    expect(events[0]!.sequenceNumber).toBe(1);
    expect(events[1]!.sequenceNumber).toBe(3);
  });
});

// ─── createCore() with persistence ────────────────────────────────────────────

describe('createCore() — with dataDir', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes events to disk when dataDir provided', () => {
    const core = createCore(WS, { dataDir: dir });
    const session = core.sessions.create({ name: 'Persist test' });
    core.sessions.emit(session.id, {
      type: 'observer.test/thing.started',
      sourceNodeId: asNodeId('node1'),
      occurredAt: Date.now(),
      payload: { key: 'value' },
    });
    core.dispose();

    const file = join(dir, 'sessions', session.id as string, 'events.ndjson');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it('writes session.json on create', () => {
    const core = createCore(WS, { dataDir: dir });
    const session = core.sessions.create({ name: 'My session' });
    core.dispose();

    const file = join(dir, 'sessions', session.id as string, 'session.json');
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Session;
    expect(parsed.name).toBe('My session');
    expect(parsed.status).toBe('ACTIVE');
  });

  it('updates session.json on pause/resume/end', () => {
    const core = createCore(WS, { dataDir: dir });
    const session = core.sessions.create({ name: 'Lifecycle' });
    const sessionFile = join(dir, 'sessions', session.id as string, 'session.json');

    core.sessions.pause(session.id);
    expect(JSON.parse(readFileSync(sessionFile, 'utf8')).status).toBe('PAUSED');

    core.sessions.resume(session.id);
    expect(JSON.parse(readFileSync(sessionFile, 'utf8')).status).toBe('ACTIVE');

    core.sessions.end(session.id);
    expect(JSON.parse(readFileSync(sessionFile, 'utf8')).status).toBe('COMPLETED');
    core.dispose();
  });

  it('no persistence without dataDir (default)', () => {
    const core = createCore(WS);
    const session = core.sessions.create({ name: 'No persist' });
    core.sessions.emit(session.id, {
      type: 'observer.test/thing.started',
      sourceNodeId: asNodeId('node1'),
      occurredAt: Date.now(),
      payload: {},
    });
    // No files written to the test tmp dir
    expect(existsSync(join(dir, 'sessions'))).toBe(false);
    core.dispose();
  });
});

// ─── loadCore() — full state restoration ──────────────────────────────────────

describe('loadCore() — full state restoration', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('restores sessions from disk', () => {
    // First run — create + persist
    const core1 = createCore(WS, { dataDir: dir });
    const s1 = core1.sessions.create({ name: 'Session Alpha' });
    const s2 = core1.sessions.create({ name: 'Session Beta' });
    core1.sessions.end(s1.id);
    core1.dispose();

    // Second run — restore
    const core2 = loadCore(dir);
    const restored = core2.sessions.list();
    expect(restored).toHaveLength(2);
    expect(restored.map(s => s.name).sort()).toEqual(['Session Alpha', 'Session Beta']);
    core2.dispose();
  });

  it('restores events from disk', () => {
    const core1 = createCore(WS, { dataDir: dir });
    const session = core1.sessions.create({ name: 'Event restore' });
    core1.sessions.emit(session.id, {
      type: 'observer.test/thing.started',
      sourceNodeId: asNodeId('nodeA'),
      occurredAt: 1000,
      payload: { info: 'hello' },
    });
    core1.sessions.emit(session.id, {
      type: 'observer.test/thing.completed',
      sourceNodeId: asNodeId('nodeA'),
      occurredAt: 2000,
      payload: { result: 'ok' },
    });
    core1.dispose();

    const core2 = loadCore(dir);
    const events = core2.events.read(session.id);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('observer.test/thing.started');
    expect(events[1]!.type).toBe('observer.test/thing.completed');
    core2.dispose();
  });

  it('restores sequence numbers — new events continue from where we left off', () => {
    const core1 = createCore(WS, { dataDir: dir });
    const session = core1.sessions.create({ name: 'Sequence test' });
    const e1 = core1.sessions.emit(session.id, {
      type: 'observer.test/a.started',
      sourceNodeId: asNodeId('n1'),
      occurredAt: Date.now(),
      payload: {},
    });
    const e2 = core1.sessions.emit(session.id, {
      type: 'observer.test/a.started',
      sourceNodeId: asNodeId('n2'),
      occurredAt: Date.now(),
      payload: {},
    });
    expect(e2.sequenceNumber).toBe(e1.sequenceNumber + 1);
    core1.dispose();

    const core2 = loadCore(dir);
    // New session to get the next sequence number
    const newSession = core2.sessions.create({ name: 'Post-restore' });
    const e3 = core2.sessions.emit(newSession.id, {
      type: 'observer.test/b.started',
      sourceNodeId: asNodeId('n3'),
      occurredAt: Date.now(),
      payload: {},
    });
    expect(e3.sequenceNumber).toBeGreaterThan(e2.sequenceNumber);
    core2.dispose();
  });

  it('rebuilds runtime graph from replayed events', () => {
    const core1 = createCore(WS, { dataDir: dir });
    const session = core1.sessions.create({ name: 'Graph restore' });
    core1.sessions.emit(session.id, {
      type: 'observer.express/request.started',
      sourceNodeId: asNodeId('req_001'),
      occurredAt: Date.now(),
      payload: { method: 'GET', path: '/api/users' },
    });
    core1.dispose();

    const core2 = loadCore(dir);
    const node = core2.graph.getNode('req_001');
    expect(node).toBeDefined();
    expect(node?.domain).toBe('express');
    expect(node?.metadata['method']).toBe('GET');
    core2.dispose();
  });

  it('rebuilds CORRELATED_WITH edges from replayed events', () => {
    const core1 = createCore(WS, { dataDir: dir });
    const session = core1.sessions.create({ name: 'Correlation restore' });
    const correlationId = 'trace_restore_001';

    core1.sessions.emit(session.id, {
      type: 'observer.browser/network.request.started',
      sourceNodeId: asNodeId('browser_node'),
      occurredAt: 1000,
      payload: { method: 'GET', url: '/api' },
      correlationId,
    });
    core1.sessions.emit(session.id, {
      type: 'observer.express/request.started',
      sourceNodeId: asNodeId('express_node'),
      occurredAt: 1001,
      payload: { method: 'GET', path: '/api' },
      correlationId,
    });
    core1.dispose();

    const core2 = loadCore(dir);
    const browserNode = core2.graph.getNode('browser_node');
    expect(browserNode?.relationships.some(
      r => r.type === 'CORRELATED_WITH' && r.target === 'express_node',
    )).toBe(true);
    core2.dispose();
  });

  it('restores session status correctly', () => {
    const core1 = createCore(WS, { dataDir: dir });
    const active  = core1.sessions.create({ name: 'Active' });
    const paused  = core1.sessions.create({ name: 'Paused' });
    const ended   = core1.sessions.create({ name: 'Ended' });
    core1.sessions.pause(paused.id);
    core1.sessions.end(ended.id);
    core1.dispose();

    const core2 = loadCore(dir);
    const byName = Object.fromEntries(core2.sessions.list().map(s => [s.name, s]));
    expect(byName['Active']!.status).toBe('ACTIVE');
    expect(byName['Paused']!.status).toBe('PAUSED');
    expect(byName['Ended']!.status).toBe('COMPLETED');
    core2.dispose();
  });

  it('continues accepting events after restore', () => {
    const core1 = createCore(WS, { dataDir: dir });
    const session = core1.sessions.create({ name: 'Continue' });
    core1.sessions.emit(session.id, {
      type: 'observer.test/a.started',
      sourceNodeId: asNodeId('n1'),
      occurredAt: Date.now(),
      payload: {},
    });
    core1.dispose();

    const core2 = loadCore(dir);
    // Emit into the restored session — it's still ACTIVE
    core2.sessions.emit(session.id, {
      type: 'observer.test/b.started',
      sourceNodeId: asNodeId('n2'),
      occurredAt: Date.now(),
      payload: {},
    });
    expect(core2.events.read(session.id)).toHaveLength(2);

    // New event should appear in the NDJSON file
    const file = join(dir, 'sessions', session.id as string, 'events.ndjson');
    const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    core2.dispose();
  });

  it('empty data dir — returns empty core', () => {
    const core = loadCore(dir);
    expect(core.sessions.list()).toHaveLength(0);
    core.dispose();
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(id: string, startedAt: number): Session {
  return {
    id: id as ReturnType<typeof import('../types/ids.js').asSessionId>,
    workspaceId: WS,
    name: `Test session ${id}`,
    status: 'ACTIVE',
    startedAt,
    tags: [],
    eventCount: 0,
    nodeCount: 0,
  };
}

function makeEvent(sessionId: string, seq: number): RuntimeEvent {
  return Object.freeze({
    id: `evt_${seq}` as ReturnType<typeof import('../types/ids.js').asEventId>,
    type: `observer.test/thing.happened`,
    sourceNodeId: `node_${seq}` as ReturnType<typeof import('../types/ids.js').asNodeId>,
    affectedNodeIds: Object.freeze([]) as readonly ReturnType<typeof import('../types/ids.js').asNodeId>[],
    occurredAt: seq * 1000,
    recordedAt: seq * 1000,
    sequenceNumber: seq,
    payload: Object.freeze({ seq }),
    sessionId: sessionId as ReturnType<typeof import('../types/ids.js').asSessionId>,
    workspaceId: WS,
    severity: 'INFO' as const,
    schemaVersion: '1.0.0',
  });
}
