import { describe, it, expect, vi } from 'vitest';
import { listSessions, getSession, searchSessions } from '../tools/sessions.js';
import { getNodes, getEvents } from '../tools/graph.js';
import { getContext, querySession } from '../tools/context.js';
import { getPerformance } from '../tools/analysis.js';
import type { DaemonClient } from '../client.js';

function mockClient(overrides: Partial<DaemonClient> = {}): DaemonClient {
  return { get: vi.fn(), post: vi.fn(), ...overrides } as unknown as DaemonClient;
}

describe('listSessions', () => {
  it('returns JSON of sessions', async () => {
    const sessions = [{ id: 'abc', name: 'test', status: 'ACTIVE' }];
    const client = mockClient({ get: vi.fn().mockResolvedValue(sessions) });
    const result = await listSessions(client);
    expect(JSON.parse(result)).toEqual(sessions);
  });

  it('returns message when no sessions', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue([]) });
    const result = await listSessions(client);
    expect(result).toContain('No sessions');
  });
});

describe('getSession', () => {
  it('returns session JSON', async () => {
    const session = { id: 'abc', status: 'ACTIVE' };
    const client = mockClient({ get: vi.fn().mockResolvedValue(session) });
    const result = await getSession(client, { session_id: 'abc' });
    expect(JSON.parse(result)).toEqual(session);
  });

  it('returns error when no session_id', async () => {
    const client = mockClient();
    const result = await getSession(client, {});
    expect(result).toContain('Error');
  });
});

describe('searchSessions', () => {
  it('returns results', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ total: 1, results: [{ id: 'x' }] }) });
    const result = await searchSessions(client, { q: 'error' });
    expect(result).toContain('Found 1');
  });

  it('returns message when empty', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ total: 0, results: [] }) });
    const result = await searchSessions(client, { q: 'nothing' });
    expect(result).toContain('No sessions matched');
  });
});

describe('getNodes', () => {
  it('returns node count and JSON', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ total: 3, nodes: [{}, {}, {}] }) });
    const result = await getNodes(client, { session_id: 'abc' });
    expect(result).toContain('3 nodes');
  });

  it('returns error when no session_id', async () => {
    const result = await getNodes(mockClient(), {});
    expect(result).toContain('Error');
  });
});

describe('getEvents', () => {
  it('returns event count and JSON', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ total: 5, events: [] }) });
    const result = await getEvents(client, { session_id: 'abc' });
    expect(result).toContain('5 events');
  });
});

describe('getContext', () => {
  it('returns markdown content', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ markdownContent: '# Context\nsome data' }) });
    const result = await getContext(client, { session_id: 'abc', node_id: 'node-1' });
    expect(result).toContain('# Context');
  });

  it('returns error when missing params', async () => {
    const result = await getContext(mockClient(), { session_id: 'abc' });
    expect(result).toContain('Error');
  });
});

describe('querySession', () => {
  it('returns AI answer', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ answer: 'It failed because X' }) });
    const result = await querySession(client, { session_id: 'abc', question: 'why failed?' });
    expect(result).toContain('It failed because X');
  });

  it('returns helpful message when AI unavailable', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ error: 'AI_UNAVAILABLE', hint: 'Set key' }) });
    const result = await querySession(client, { session_id: 'abc', question: 'why?' });
    expect(result).toContain('AI unavailable');
  });

  it('returns error when missing params', async () => {
    const result = await querySession(mockClient(), { session_id: 'abc' });
    expect(result).toContain('Error');
  });
});

describe('getPerformance', () => {
  it('returns performance JSON', async () => {
    const report = { buckets: [], slowest: [] };
    const client = mockClient({ get: vi.fn().mockResolvedValue(report) });
    const result = await getPerformance(client, { session_id: 'abc' });
    expect(JSON.parse(result)).toEqual(report);
  });
});
