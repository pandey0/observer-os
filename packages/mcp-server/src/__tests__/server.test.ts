import { describe, it, expect, vi } from 'vitest';
import {
  cdpStatus,
  cdpListPages,
  cdpNavigate,
  cdpNewPage,
  cdpSelectPage,
  cdpTakeScreenshot,
  cdpTakeScreenshotRaw,
  cdpTakeSnapshot,
  cdpEvaluate,
  cdpClick,
  cdpFill,
  cdpPressKey,
  cdpGetConsole,
  cdpGetNetwork,
  cdpHeapSnapshot,
  cdpStartPerformance,
  cdpStopPerformance,
  cdpEmulate,
} from '../tools/cdp.js';
import type { DaemonClient } from '../client.js';

function mockClient(overrides: Partial<DaemonClient> = {}): DaemonClient {
  return { get: vi.fn(), post: vi.fn(), ...overrides } as unknown as DaemonClient;
}

describe('CDP tools registration', () => {
  it('cdp_status tool is importable', () => {
    expect(cdpStatus).toBeTypeOf('function');
  });

  it('cdp_list_pages tool is importable', () => {
    expect(cdpListPages).toBeTypeOf('function');
  });

  it('cdp_navigate tool is importable', () => {
    expect(cdpNavigate).toBeTypeOf('function');
  });

  it('cdp_take_screenshot tool is importable', () => {
    expect(cdpTakeScreenshot).toBeTypeOf('function');
  });

  it('cdp_emulate tool is importable', () => {
    expect(cdpEmulate).toBeTypeOf('function');
  });
});

describe('cdpStatus', () => {
  it('returns JSON with connected field', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ connected: false, chromeUrl: 'http://localhost:9222', message: 'Not connected' }),
    });
    const result = await cdpStatus(client);
    const parsed = JSON.parse(result) as { connected: boolean; chromeUrl: string };
    expect(typeof parsed.connected).toBe('boolean');
    expect(parsed.chromeUrl).toBe('http://localhost:9222');
  });
});

describe('cdpListPages', () => {
  it('returns JSON array of pages', async () => {
    const pages = [{ id: 0, url: 'http://example.com', title: 'Example' }];
    const client = mockClient({ get: vi.fn().mockResolvedValue({ pages }) });
    const result = await cdpListPages(client);
    expect(JSON.parse(result)).toEqual(pages);
  });
});

describe('cdpNavigate', () => {
  it('returns navigated url and title', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ url: 'http://example.com', title: 'Example' }),
    });
    const result = await cdpNavigate(client, { url: 'http://example.com' });
    expect(result).toContain('http://example.com');
    expect(result).toContain('Example');
  });
});

describe('cdpNewPage', () => {
  it('returns opened page info', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ id: 1, url: 'about:blank', title: '' }),
    });
    const result = await cdpNewPage(client, {});
    expect(result).toContain('id: 1');
  });
});

describe('cdpSelectPage', () => {
  it('returns selected page confirmation', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ ok: true }) });
    const result = await cdpSelectPage(client, { id: 2 });
    expect(result).toContain('2');
  });
});

describe('cdpTakeScreenshot', () => {
  it('returns base64 string description', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ data: 'abc123', mimeType: 'image/png' }),
    });
    const result = await cdpTakeScreenshot(client, {});
    expect(result).toContain('base64');
  });
});

describe('cdpTakeScreenshotRaw', () => {
  it('returns image content block', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ data: 'abc123base64', mimeType: 'image/png' }),
    });
    const result = await cdpTakeScreenshotRaw(client, {});
    expect(result.content[0].type).toBe('image');
    expect(result.content[0].data).toBe('abc123base64');
    expect(result.content[0].mimeType).toBe('image/png');
  });
});

describe('cdpTakeSnapshot', () => {
  it('returns snapshot string', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ snapshot: '{"role":"RootWebArea"}' }),
    });
    const result = await cdpTakeSnapshot(client);
    expect(result).toContain('RootWebArea');
  });
});

describe('cdpEvaluate', () => {
  it('returns evaluated result', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: '42' }),
    });
    const result = await cdpEvaluate(client, { script: '21 + 21' });
    expect(result).toBe('42');
  });
});

describe('cdpClick', () => {
  it('returns click confirmation', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ ok: true }) });
    const result = await cdpClick(client, { selector: '#btn' });
    expect(result).toContain('#btn');
  });
});

describe('cdpFill', () => {
  it('returns fill confirmation', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ ok: true }) });
    const result = await cdpFill(client, { selector: '#email', value: 'test@test.com' });
    expect(result).toContain('#email');
  });
});

describe('cdpPressKey', () => {
  it('returns key press confirmation', async () => {
    const client = mockClient({ post: vi.fn().mockResolvedValue({ ok: true }) });
    const result = await cdpPressKey(client, { key: 'Enter' });
    expect(result).toContain('Enter');
  });
});

describe('cdpGetConsole', () => {
  it('returns console messages', async () => {
    const messages = [{ id: 1, type: 'log', text: 'hello', timestamp: 1000 }];
    const client = mockClient({ get: vi.fn().mockResolvedValue({ messages }) });
    const result = await cdpGetConsole(client, {});
    expect(result).toContain('hello');
  });

  it('returns helpful message when no messages', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ messages: [] }) });
    const result = await cdpGetConsole(client, {});
    expect(result).toContain('No console messages');
  });
});

describe('cdpGetNetwork', () => {
  it('returns network requests', async () => {
    const requests = [{ id: 'req-1', method: 'GET', url: '/api/data', status: 200 }];
    const client = mockClient({ get: vi.fn().mockResolvedValue({ requests }) });
    const result = await cdpGetNetwork(client, {});
    expect(result).toContain('/api/data');
  });

  it('returns helpful message when no requests', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ requests: [] }) });
    const result = await cdpGetNetwork(client, {});
    expect(result).toContain('No network requests');
  });
});

describe('cdpHeapSnapshot', () => {
  it('returns summary string', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ totalSize: 1048576, summary: 'Heap snapshot: 1.00 MB in 3 chunks.' }),
    });
    const result = await cdpHeapSnapshot(client);
    expect(result).toContain('Heap snapshot');
  });
});

describe('cdpStartPerformance', () => {
  it('returns start message', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ ok: true, message: 'Performance trace started' }),
    });
    const result = await cdpStartPerformance(client);
    expect(result).toContain('Performance trace started');
  });
});

describe('cdpStopPerformance', () => {
  it('returns summary string', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ summary: 'Performance trace captured.' }),
    });
    const result = await cdpStopPerformance(client);
    expect(result).toContain('Performance trace captured');
  });
});

describe('cdpEmulate', () => {
  it('returns emulation confirmation', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ ok: true, device: 'iPhone 12' }),
    });
    const result = await cdpEmulate(client, { device: 'iPhone 12' });
    expect(result).toContain('iPhone 12');
  });
});
