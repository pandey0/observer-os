import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock puppeteer-core before imports
const mockPage = {
  url: vi.fn().mockReturnValue('http://localhost:3000'),
  title: vi.fn().mockResolvedValue('Test Page'),
  goto: vi.fn().mockResolvedValue(null),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  accessibility: { snapshot: vi.fn().mockResolvedValue({ role: 'RootWebArea', children: [] }) },
  evaluate: vi.fn().mockResolvedValue('result'),
  click: vi.fn().mockResolvedValue(undefined),
  focus: vi.fn().mockResolvedValue(undefined),
  type: vi.fn().mockResolvedValue(undefined),
  keyboard: { press: vi.fn().mockResolvedValue(undefined) },
  $: vi.fn().mockResolvedValue({ screenshot: vi.fn().mockResolvedValue(Buffer.from('el-png')) }),
  on: vi.fn(),
  createCDPSession: vi.fn().mockResolvedValue({
    send: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
    detach: vi.fn().mockResolvedValue(undefined),
  }),
  _client: null,
};

const mockBrowser = {
  pages: vi.fn().mockResolvedValue([mockPage]),
  newPage: vi.fn().mockResolvedValue(mockPage),
  on: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(undefined),
  connected: true,
};

vi.mock('puppeteer-core', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

import { CdpBridge } from '../CdpBridge.js';

describe('CdpBridge', () => {
  let bridge: CdpBridge;

  beforeEach(() => {
    bridge = new CdpBridge({ chromeUrl: 'http://localhost:9222' });
    vi.clearAllMocks();
    // Reset mock browser state
    mockBrowser.pages.mockResolvedValue([mockPage]);
    mockBrowser.connected = true;
  });

  afterEach(async () => {
    await bridge.dispose();
  });

  describe('status()', () => {
    it('returns connected when Chrome reachable', async () => {
      const result = await bridge.status();
      expect(result.connected).toBe(true);
      expect(result.chromeUrl).toBe('http://localhost:9222');
    });

    it('returns disconnected when Chrome not available', async () => {
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.connect).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const fresh = new CdpBridge({ chromeUrl: 'http://localhost:9222' });
      const result = await fresh.status();
      expect(result.connected).toBe(false);
      expect(result.message).toContain('Not connected');
    });
  });

  describe('listPages()', () => {
    it('returns pages with id, url, title', async () => {
      const pages = await bridge.listPages();
      expect(pages).toHaveLength(1);
      expect(pages[0]).toMatchObject({ id: 0, url: 'http://localhost:3000', title: 'Test Page' });
    });
  });

  describe('navigate()', () => {
    it('calls page.goto with the URL', async () => {
      const result = await bridge.navigate('http://example.com');
      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', expect.any(Object));
      expect(result).toHaveProperty('url');
    });
  });

  describe('takeScreenshot()', () => {
    it('returns base64 string', async () => {
      const result = await bridge.takeScreenshot();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('takeSnapshot()', () => {
    it('returns accessibility tree JSON', async () => {
      const result = await bridge.takeSnapshot();
      const parsed = JSON.parse(result) as unknown;
      expect(parsed).toBeDefined();
    });
  });

  describe('evaluate()', () => {
    it('evaluates JS and returns string result', async () => {
      mockPage.evaluate.mockResolvedValueOnce('hello');
      const result = await bridge.evaluate('document.title');
      expect(result).toBe('hello');
    });

    it('JSON-stringifies non-string results', async () => {
      mockPage.evaluate.mockResolvedValueOnce({ count: 3 });
      const result = await bridge.evaluate('({count: 3})');
      expect(result).toContain('"count"');
    });
  });

  describe('click()', () => {
    it('calls page.click with selector', async () => {
      await bridge.click('#submit-btn');
      expect(mockPage.click).toHaveBeenCalledWith('#submit-btn');
    });
  });

  describe('fill()', () => {
    it('focuses and types into selector', async () => {
      await bridge.fill('#email', 'test@example.com');
      expect(mockPage.focus).toHaveBeenCalledWith('#email');
      expect(mockPage.type).toHaveBeenCalledWith('#email', 'test@example.com');
    });
  });

  describe('getConsoleMessages()', () => {
    it('returns empty array initially', () => {
      expect(bridge.getConsoleMessages()).toEqual([]);
    });
  });

  describe('getNetworkRequests()', () => {
    it('returns empty array initially', () => {
      expect(bridge.getNetworkRequests()).toEqual([]);
    });
  });

  describe('dispose()', () => {
    it('disconnects browser', async () => {
      await bridge.status(); // connect
      await bridge.dispose();
      expect(mockBrowser.disconnect).toHaveBeenCalled();
    });
  });
});
