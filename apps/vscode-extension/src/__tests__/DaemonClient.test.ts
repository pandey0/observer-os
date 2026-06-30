import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonClient } from '../DaemonClient.js';

describe('DaemonClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isAlive returns true on 200', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    expect(await client.isAlive()).toBe(true);
  });

  it('isAlive returns false on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    expect(await client.isAlive()).toBe(false);
  });

  it('isAlive returns false on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    expect(await client.isAlive()).toBe(false);
  });

  it('listSessions calls GET /api/sessions', async () => {
    const sessions = [{ id: 'abc', status: 'ACTIVE', nodeCount: 1, eventCount: 5 }];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(sessions) } as unknown as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    const result = await client.listSessions();
    expect(result).toEqual(sessions);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/api/sessions');
  });

  it('listSessions throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    await expect(client.listSessions()).rejects.toThrow('HTTP 500');
  });

  it('createSession POSTs with name in body', async () => {
    const session = { id: 'xyz', name: 'my-session', status: 'ACTIVE', nodeCount: 0, eventCount: 0 };
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(session) } as unknown as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    const result = await client.createSession('my-session');
    expect(result.name).toBe('my-session');
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[1]?.method).toBe('POST');
    expect(call?.[1]?.body).toContain('my-session');
  });

  it('getNodes returns nodes array', async () => {
    const nodes = [{ id: 'n1', type: 'express:Route', domain: 'express', status: 'ACTIVE', createdAt: 1 }];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ nodes }) } as unknown as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    const result = await client.getNodes('ses1');
    expect(result).toEqual(nodes);
  });

  it('getContext POSTs with anchor nodeId', async () => {
    const pkg = { markdownContent: '# Context', tokenEstimate: 500 };
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(pkg) } as unknown as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000' });
    const result = await client.getContext('ses1', 'node-1');
    expect(result.markdownContent).toBe('# Context');
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string) as { anchor: { nodeId: string } };
    expect(body.anchor.nodeId).toBe('node-1');
  });

  it('sets Authorization header when apiKey provided', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) } as unknown as Response);
    const client = new DaemonClient({ url: 'http://localhost:4000', apiKey: 'secret' });
    await client.listSessions();
    const headers = vi.mocked(fetch).mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers?.['authorization']).toBe('Bearer secret');
  });

  it('updateConfig changes the URL used for requests', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) } as unknown as Response);
    const client = new DaemonClient({ url: 'http://old:4000' });
    client.updateConfig({ url: 'http://new:4000' });
    await client.listSessions();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('http://new:4000');
  });
});
