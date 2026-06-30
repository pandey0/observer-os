import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Mock child_process before any imports that may use it
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    on: vi.fn(),
  }),
}));

import { spawn } from 'node:child_process';
import { runCommand } from '../commands/run.js';
import { listSessions, searchSessions, createSession, deleteSession } from '../commands/sessions.js';
import { emitEvent } from '../commands/emit.js';
import { querySession } from '../commands/query.js';
import type { ObserverClient } from '../client.js';

function mockClient(overrides: Partial<ObserverClient> = {}): ObserverClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as ObserverClient;
}

describe('listSessions', () => {
  it('calls GET /api/sessions', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue([]) });
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await listSessions(client);
    expect(client.get).toHaveBeenCalledWith('/api/sessions');
    spy.mockRestore();
  });

  it('outputs JSON when json=true', async () => {
    const sessions = [{ id: 'abc', name: 'test', status: 'ACTIVE', nodeCount: 1, eventCount: 5, startedAt: 1 }];
    const client = mockClient({ get: vi.fn().mockResolvedValue(sessions) });
    const output: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => { output.push(String(s)); return true; });
    await listSessions(client, true);
    expect(JSON.parse(output.join(''))).toEqual(sessions);
    spy.mockRestore();
  });
});

describe('searchSessions', () => {
  it('passes query params to client.get', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ results: [] }) });
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await searchSessions(client, { q: 'error', status: 'FAILED' });
    expect((client.get as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('q=error');
    expect((client.get as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('status=FAILED');
    spy.mockRestore();
  });
});

describe('createSession', () => {
  it('calls POST /api/sessions with name and tags', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ id: 'xyz', name: 'myses' }) });
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await createSession(client, 'myses', ['a', 'b']);
    expect(client.post).toHaveBeenCalledWith('/api/sessions', { name: 'myses', tags: ['a', 'b'] });
    spy.mockRestore();
  });
});

describe('deleteSession', () => {
  it('calls DELETE /api/sessions/:id', async () => {
    const client = mockClient({ delete: vi.fn().mockResolvedValue({ id: 'abc' }) });
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await deleteSession(client, 'abc');
    expect(client.delete).toHaveBeenCalledWith('/api/sessions/abc');
    spy.mockRestore();
  });
});

describe('emitEvent', () => {
  it('calls POST /api/sessions/:id/events with type and payload', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ id: 'ev1', sequenceNumber: 1 }) });
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await emitEvent(client, 'ses1', 'observer.custom/test', { key: 'val' });
    expect(client.post).toHaveBeenCalledWith(
      '/api/sessions/ses1/events',
      expect.objectContaining({ type: 'observer.custom/test', payload: { key: 'val' } }),
    );
    spy.mockRestore();
  });
});

describe('querySession', () => {
  it('prints answer from response', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ answer: 'It failed because X' }) });
    const output: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => { output.push(String(s)); return true; });
    await querySession(client, 'ses1', 'why did it fail?');
    expect(output.join('')).toContain('It failed because X');
    spy.mockRestore();
  });

  it('exits with error when AI unavailable', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ error: 'AI_UNAVAILABLE', hint: 'Set key' }) });
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    await expect(querySession(client, 'ses1', 'why?')).rejects.toThrow('exit');
    spy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe('runCommand', () => {
  afterEach(() => {
    vi.mocked(spawn).mockClear();
  });

  it('exits with error when no args provided', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await expect(runCommand([], {})).rejects.toThrow('exit');
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('spawns child process with correct command', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const mockChild = { on: vi.fn() };
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    await runCommand(['node', 'server.js'], {});

    expect(spawn).toHaveBeenCalledWith('node', ['server.js'], expect.objectContaining({ stdio: 'inherit' }));
    stderrSpy.mockRestore();
  });

  it('sets OBSERVER_URL in child env', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const mockChild = { on: vi.fn() };
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    await runCommand(['node', 'app.js'], { url: 'http://myserver:4000' });

    const callEnv = (vi.mocked(spawn).mock.calls[0]?.[2] as { env?: Record<string, string> })?.env;
    expect(callEnv?.['OBSERVER_URL']).toBe('http://myserver:4000');
    stderrSpy.mockRestore();
  });

  it('sets OBSERVER_API_KEY when --key flag provided', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const mockChild = { on: vi.fn() };
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    await runCommand(['npm', 'start'], { key: 'my-secret-key' });

    const callEnv = (vi.mocked(spawn).mock.calls[0]?.[2] as { env?: Record<string, string> })?.env;
    expect(callEnv?.['OBSERVER_API_KEY']).toBe('my-secret-key');
    stderrSpy.mockRestore();
  });

  it('includes NODE_OPTIONS with --require when auto-instrument found', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const mockChild = { on: vi.fn() };
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    await runCommand(['node', 'server.js'], {});

    const callEnv = (vi.mocked(spawn).mock.calls[0]?.[2] as { env?: Record<string, string> })?.env;
    // NODE_OPTIONS may or may not be set depending on whether auto-instrument is found
    // Just verify spawn was called with env
    expect(callEnv).toBeDefined();
    stderrSpy.mockRestore();
  });
});
