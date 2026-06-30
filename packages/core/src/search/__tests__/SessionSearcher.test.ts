import { describe, it, expect } from 'vitest';
import { SessionSearcher } from '../SessionSearcher.js';
import type { Session, RuntimeNode, RuntimeEvent } from '../../types/index.js';
import type { SessionId } from '../../types/ids.js';
import { asSessionId, asNodeId, asEventId, asWorkspaceId, asDomainId } from '../../types/ids.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> & { id?: string }): Session {
  return {
    id: asSessionId(overrides.id ?? 'session_1'),
    workspaceId: asWorkspaceId('ws_test'),
    name: overrides.name ?? 'Test Session',
    status: overrides.status ?? 'ACTIVE',
    startedAt: overrides.startedAt ?? Date.now(),
    tags: overrides.tags ?? [],
    eventCount: overrides.eventCount ?? 0,
    nodeCount: overrides.nodeCount ?? 0,
    endedAt: overrides.endedAt,
    pausedAt: overrides.pausedAt,
  };
}

function makeNode(overrides: Partial<RuntimeNode> & { id?: string; sessionId?: string }): RuntimeNode {
  return {
    id: asNodeId(overrides.id ?? 'node_1'),
    type: overrides.type ?? 'observer.test/Node',
    domain: asDomainId(overrides.domain ?? 'test'),
    sessionId: asSessionId(overrides.sessionId ?? 'session_1'),
    workspaceId: asWorkspaceId('ws_test'),
    status: overrides.status ?? 'ACTIVE',
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    completedAt: overrides.completedAt,
    metadata: overrides.metadata ?? {},
    capabilities: overrides.capabilities ?? [],
    relationships: overrides.relationships ?? [],
    version: overrides.version ?? 1,
    visibility: overrides.visibility ?? 'SESSION',
  };
}

function makeEvent(overrides: Partial<RuntimeEvent> & { id?: string; sessionId?: string }): RuntimeEvent {
  return {
    id: asEventId(overrides.id ?? 'event_1'),
    type: overrides.type ?? 'observer.test/something',
    sourceNodeId: asNodeId(overrides.sourceNodeId as string ?? 'node_1'),
    affectedNodeIds: overrides.affectedNodeIds ?? [],
    occurredAt: overrides.occurredAt ?? Date.now(),
    recordedAt: overrides.recordedAt ?? Date.now(),
    sequenceNumber: overrides.sequenceNumber ?? 1,
    payload: overrides.payload ?? {},
    causedByEventId: overrides.causedByEventId,
    correlationId: overrides.correlationId,
    sessionId: asSessionId(overrides.sessionId ?? 'session_1'),
    workspaceId: asWorkspaceId('ws_test'),
    severity: overrides.severity ?? 'INFO',
    schemaVersion: overrides.schemaVersion ?? '1.0',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SessionSearcher', () => {
  const searcher = new SessionSearcher();

  const noNodes = (_id: SessionId): RuntimeNode[] => [];
  const noEvents = (_id: SessionId): RuntimeEvent[] => [];

  // ─── q filter ──────────────────────────────────────────────────────────────

  describe('q filter (name match)', () => {
    const sessions = [
      makeSession({ id: 'session_1', name: 'Authentication Flow' }),
      makeSession({ id: 'session_2', name: 'Payment Checkout' }),
      makeSession({ id: 'session_3', name: 'User Registration' }),
    ];

    it('matches by name substring (case-insensitive)', () => {
      const results = searcher.search({ q: 'auth' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(1);
      expect(results[0]?.session.name).toBe('Authentication Flow');
    });

    it('is case-insensitive', () => {
      const results = searcher.search({ q: 'PAYMENT' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(1);
      expect(results[0]?.session.name).toBe('Payment Checkout');
    });

    it('returns no results when no match', () => {
      const results = searcher.search({ q: 'NonExistentTerm' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(0);
    });

    it('returns all sessions when q is undefined', () => {
      const results = searcher.search({}, sessions, noNodes, noEvents);
      expect(results).toHaveLength(3);
    });
  });

  // ─── status filter ─────────────────────────────────────────────────────────

  describe('status filter', () => {
    const sessions = [
      makeSession({ id: 'session_1', status: 'ACTIVE' }),
      makeSession({ id: 'session_2', status: 'COMPLETED' }),
      makeSession({ id: 'session_3', status: 'PAUSED' }),
    ];

    it('filters by status', () => {
      const results = searcher.search({ status: 'ACTIVE' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(1);
      expect(results[0]?.session.status).toBe('ACTIVE');
    });

    it('returns COMPLETED sessions', () => {
      const results = searcher.search({ status: 'COMPLETED' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(1);
      expect(results[0]?.session.status).toBe('COMPLETED');
    });

    it('returns no results for non-existent status', () => {
      const results = searcher.search({ status: 'ARCHIVED' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(0);
    });
  });

  // ─── tag filter ────────────────────────────────────────────────────────────

  describe('tag filter', () => {
    const sessions = [
      makeSession({ id: 'session_1', tags: ['production', 'critical'] }),
      makeSession({ id: 'session_2', tags: ['staging'] }),
      makeSession({ id: 'session_3', tags: ['production', 'staging'] }),
    ];

    it('filters sessions that include the tag', () => {
      const results = searcher.search({ tag: 'production' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.session.tags.includes('production'))).toBe(true);
    });

    it('returns no results when tag not present', () => {
      const results = searcher.search({ tag: 'development' }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(0);
    });

    it('matchedTags contains only the matched tag', () => {
      const results = searcher.search({ tag: 'production' }, [sessions[0]!], noNodes, noEvents);
      expect(results[0]?.matches.matchedTags).toEqual(['production']);
    });
  });

  // ─── domain filter ─────────────────────────────────────────────────────────

  describe('domain filter', () => {
    const sessionA = makeSession({ id: 'session_a', name: 'Session A' });
    const sessionB = makeSession({ id: 'session_b', name: 'Session B' });

    const nodesBySid: Record<string, RuntimeNode[]> = {
      session_a: [
        makeNode({ id: 'node_1', sessionId: 'session_a', domain: 'browser' }),
        makeNode({ id: 'node_2', sessionId: 'session_a', domain: 'express' }),
      ],
      session_b: [
        makeNode({ id: 'node_3', sessionId: 'session_b', domain: 'postgres' }),
      ],
    };

    const getNodes = (id: SessionId): RuntimeNode[] => nodesBySid[id as string] ?? [];

    it('returns session with matching node domain', () => {
      const results = searcher.search(
        { domain: 'browser' },
        [sessionA, sessionB],
        getNodes,
        noEvents,
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.session.id).toBe('session_a');
    });

    it('returns no results when no node has matching domain', () => {
      const results = searcher.search(
        { domain: 'redis' },
        [sessionA, sessionB],
        getNodes,
        noEvents,
      );
      expect(results).toHaveLength(0);
    });

    it('returns session with postgres domain', () => {
      const results = searcher.search(
        { domain: 'postgres' },
        [sessionA, sessionB],
        getNodes,
        noEvents,
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.session.id).toBe('session_b');
    });
  });

  // ─── from/to date range ────────────────────────────────────────────────────

  describe('from/to date range filter', () => {
    const now = 1_700_000_000_000;
    const sessions = [
      makeSession({ id: 'session_1', startedAt: now - 10_000 }),
      makeSession({ id: 'session_2', startedAt: now }),
      makeSession({ id: 'session_3', startedAt: now + 10_000 }),
    ];

    it('filters by from (inclusive)', () => {
      const results = searcher.search({ from: now }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.session.startedAt >= now)).toBe(true);
    });

    it('filters by to (inclusive)', () => {
      const results = searcher.search({ to: now }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.session.startedAt <= now)).toBe(true);
    });

    it('filters by from and to combined', () => {
      const results = searcher.search({ from: now, to: now }, sessions, noNodes, noEvents);
      expect(results).toHaveLength(1);
      expect(results[0]?.session.startedAt).toBe(now);
    });
  });

  // ─── match metadata ────────────────────────────────────────────────────────

  describe('match metadata', () => {
    const session = makeSession({ id: 'session_meta', name: 'Meta Session' });

    const nodes: RuntimeNode[] = [
      makeNode({ id: 'n1', sessionId: 'session_meta', status: 'FAILED', domain: 'browser' }),
      makeNode({ id: 'n2', sessionId: 'session_meta', status: 'FAILED', domain: 'browser' }),
      makeNode({ id: 'n3', sessionId: 'session_meta', status: 'ACTIVE', domain: 'express' }),
      makeNode({ id: 'n4', sessionId: 'session_meta', status: 'ACTIVE', domain: 'postgres' }),
    ];

    const events: RuntimeEvent[] = [
      makeEvent({ id: 'e1', sessionId: 'session_meta', type: 'observer.browser/request.started' }),
      makeEvent({ id: 'e2', sessionId: 'session_meta', type: 'observer.browser/request.started' }),
      makeEvent({ id: 'e3', sessionId: 'session_meta', type: 'observer.browser/request.started' }),
      makeEvent({ id: 'e4', sessionId: 'session_meta', type: 'observer.express/handler.called' }),
      makeEvent({ id: 'e5', sessionId: 'session_meta', type: 'observer.express/handler.called' }),
      makeEvent({ id: 'e6', sessionId: 'session_meta', type: 'observer.postgres/query.completed' }),
    ];

    const getNodes = (_id: SessionId): RuntimeNode[] => nodes;
    const getEvents = (_id: SessionId): RuntimeEvent[] => events;

    it('failedNodeCount is correct', () => {
      const results = searcher.search({}, [session], getNodes, getEvents);
      expect(results[0]?.matches.failedNodeCount).toBe(2);
    });

    it('topEventTypes returns top 3 sorted by count DESC', () => {
      const results = searcher.search({}, [session], getNodes, getEvents);
      const top = results[0]?.matches.topEventTypes ?? [];
      expect(top).toHaveLength(3);
      expect(top[0]?.type).toBe('observer.browser/request.started');
      expect(top[0]?.count).toBe(3);
      expect(top[1]?.type).toBe('observer.express/handler.called');
      expect(top[1]?.count).toBe(2);
      expect(top[2]?.type).toBe('observer.postgres/query.completed');
      expect(top[2]?.count).toBe(1);
    });

    it('topNodeDomains returns top 3 sorted by count DESC', () => {
      const results = searcher.search({}, [session], getNodes, getEvents);
      const top = results[0]?.matches.topNodeDomains ?? [];
      expect(top[0]?.domain).toBe('browser');
      expect(top[0]?.count).toBe(2);
    });
  });

  // ─── empty sessions ────────────────────────────────────────────────────────

  describe('empty sessions array', () => {
    it('returns empty array', () => {
      const results = searcher.search({ q: 'anything' }, [], noNodes, noEvents);
      expect(results).toHaveLength(0);
    });
  });

  // ─── combined filters (AND logic) ─────────────────────────────────────────

  describe('combined filters (AND logic)', () => {
    const now = 1_700_000_000_000;
    const sessions = [
      makeSession({ id: 's1', name: 'Auth Flow', status: 'ACTIVE', tags: ['production'], startedAt: now }),
      makeSession({ id: 's2', name: 'Auth Flow', status: 'COMPLETED', tags: ['production'], startedAt: now }),
      makeSession({ id: 's3', name: 'Payment Flow', status: 'ACTIVE', tags: ['production'], startedAt: now }),
      makeSession({ id: 's4', name: 'Auth Flow', status: 'ACTIVE', tags: ['staging'], startedAt: now }),
    ];

    it('applies all filters with AND logic', () => {
      const results = searcher.search(
        { q: 'auth', status: 'ACTIVE', tag: 'production' },
        sessions,
        noNodes,
        noEvents,
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.session.id).toBe('s1');
    });
  });

  // ─── sort order ───────────────────────────────────────────────────────────

  describe('sort order', () => {
    it('sorts results by startedAt DESC', () => {
      const now = 1_700_000_000_000;
      const sessions = [
        makeSession({ id: 's1', startedAt: now - 2000 }),
        makeSession({ id: 's3', startedAt: now }),
        makeSession({ id: 's2', startedAt: now - 1000 }),
      ];
      const results = searcher.search({}, sessions, noNodes, noEvents);
      expect(results[0]?.session.id).toBe('s3');
      expect(results[1]?.session.id).toBe('s2');
      expect(results[2]?.session.id).toBe('s1');
    });
  });
});
