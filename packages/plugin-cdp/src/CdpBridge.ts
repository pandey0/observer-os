import type { Browser, Page } from 'puppeteer-core';

export interface CdpPage {
  id: number;
  url: string;
  title: string;
}

export interface ConsoleMessage {
  id: number;
  type: string;
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status?: number;
  mimeType?: string;
  responseSize?: number;
  duration?: number;
  failed?: boolean;
  errorText?: string;
}

export interface CdpBridgeOptions {
  chromeUrl?: string;
}

export class CdpBridge {
  private browser: Browser | null = null;
  private selectedPageIndex = 0;
  private consoleMsgs: ConsoleMessage[] = [];
  private networkReqs = new Map<string, NetworkRequest>();
  private msgIdCounter = 0;
  private reqIdCounter = 0;

  constructor(private readonly opts: CdpBridgeOptions = {}) {}

  get chromeUrl(): string {
    return this.opts.chromeUrl ?? process.env['CHROME_URL'] ?? 'http://localhost:9222';
  }

  async connect(): Promise<void> {
    if (this.browser) return;
    // Dynamic import so tests can mock it
    const { default: puppeteer } = await import('puppeteer-core');
    this.browser = await puppeteer.connect({ browserURL: this.chromeUrl });
    this.browser.on('disconnected', () => { this.browser = null; });
    // Attach listeners to all existing pages
    const pages = await this.browser.pages();
    for (const page of pages) this.attachListeners(page);
  }

  private attachListeners(page: Page): void {
    page.on('console', (msg) => {
      this.consoleMsgs.push({
        id: ++this.msgIdCounter,
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
        url: page.url(),
      });
      // Cap at 500 messages
      if (this.consoleMsgs.length > 500) this.consoleMsgs.shift();
    });

    const client = (page as unknown as { _client?: { send: (method: string, params?: unknown) => Promise<unknown> } })._client;
    if (client) {
      void client.send('Network.enable').catch(() => {});
      // Listen via CDP events — use page's internal CDP session
    }

    page.on('request', (req) => {
      const id = `req-${++this.reqIdCounter}`;
      (req as unknown as { _id?: string })._id = id;
      this.networkReqs.set(id, {
        id,
        method: req.method(),
        url: req.url(),
      });
    });

    page.on('response', (res) => {
      const req = res.request() as unknown as { _id?: string };
      if (req._id && this.networkReqs.has(req._id)) {
        const entry = this.networkReqs.get(req._id)!;
        entry.status = res.status();
        entry.mimeType = res.headers()['content-type'] ?? undefined;
      }
    });

    page.on('requestfailed', (req) => {
      const r = req as unknown as { _id?: string };
      if (r._id && this.networkReqs.has(r._id)) {
        const entry = this.networkReqs.get(r._id)!;
        entry.failed = true;
        entry.errorText = req.failure()?.errorText ?? 'unknown';
      }
    });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.browser || !this.browser.connected) {
      await this.connect();
    }
  }

  private async getPage(): Promise<Page> {
    await this.ensureConnected();
    const pages = await this.browser!.pages();
    if (pages.length === 0) throw new Error('No pages open in Chrome');
    const idx = Math.min(this.selectedPageIndex, pages.length - 1);
    return pages[idx]!;
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  async status(): Promise<{ connected: boolean; chromeUrl: string; message: string }> {
    try {
      await this.ensureConnected();
      const pages = await this.browser!.pages();
      return { connected: true, chromeUrl: this.chromeUrl, message: `Connected — ${pages.length} page(s) open` };
    } catch (err) {
      return { connected: false, chromeUrl: this.chromeUrl, message: `Not connected: ${err instanceof Error ? err.message : String(err)}. Start Chrome with --remote-debugging-port=9222` };
    }
  }

  // ─── Pages ────────────────────────────────────────────────────────────────
  async listPages(): Promise<CdpPage[]> {
    await this.ensureConnected();
    const pages = await this.browser!.pages();
    return Promise.all(pages.map(async (p, i) => ({
      id: i,
      url: p.url(),
      title: await p.title(),
    })));
  }

  async selectPage(id: number): Promise<void> {
    this.selectedPageIndex = id;
  }

  async newPage(url?: string): Promise<CdpPage> {
    await this.ensureConnected();
    const page = await this.browser!.newPage();
    this.attachListeners(page);
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
    const pages = await this.browser!.pages();
    const idx = pages.indexOf(page);
    this.selectedPageIndex = idx;
    return { id: idx, url: page.url(), title: await page.title() };
  }

  async navigate(url: string): Promise<{ url: string; title: string }> {
    const page = await this.getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { url: page.url(), title: await page.title() };
  }

  // ─── Visual ───────────────────────────────────────────────────────────────
  async takeScreenshot(selector?: string): Promise<string> {
    const page = await this.getPage();
    let data: Buffer;
    if (selector) {
      const el = await page.$(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);
      data = await el.screenshot({ type: 'png' }) as Buffer;
    } else {
      data = await page.screenshot({ type: 'png', fullPage: false }) as Buffer;
    }
    return data.toString('base64');
  }

  async takeSnapshot(): Promise<string> {
    const page = await this.getPage();
    // Get accessibility tree as readable text
    const snapshot = await page.accessibility.snapshot();
    return JSON.stringify(snapshot, null, 2);
  }

  // ─── Script ───────────────────────────────────────────────────────────────
  async evaluate(script: string): Promise<string> {
    const page = await this.getPage();
    const result = await page.evaluate(script) as unknown;
    if (result === undefined) return 'undefined';
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  }

  // ─── Input ────────────────────────────────────────────────────────────────
  async click(selector: string): Promise<void> {
    const page = await this.getPage();
    await page.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    const page = await this.getPage();
    await page.focus(selector);
    await page.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (el) el.value = '';
    }, selector);
    await page.type(selector, value);
  }

  async pressKey(key: string): Promise<void> {
    const page = await this.getPage();
    await page.keyboard.press(key as Parameters<typeof page.keyboard.press>[0]);
  }

  // ─── Console ──────────────────────────────────────────────────────────────
  getConsoleMessages(limit = 50): ConsoleMessage[] {
    return this.consoleMsgs.slice(-limit);
  }

  clearConsole(): void {
    this.consoleMsgs = [];
  }

  // ─── Network ──────────────────────────────────────────────────────────────
  getNetworkRequests(limit = 50): NetworkRequest[] {
    return Array.from(this.networkReqs.values()).slice(-limit);
  }

  clearNetwork(): void {
    this.networkReqs.clear();
  }

  // ─── Memory ───────────────────────────────────────────────────────────────
  async takeHeapSnapshot(): Promise<{ totalSize: number; summary: string }> {
    const page = await this.getPage();
    // Use CDP session directly for heap snapshot
    const client = await page.createCDPSession();
    let totalSize = 0;
    let chunks = 0;
    client.on('HeapProfiler.addHeapSnapshotChunk', () => { chunks++; });

    await client.send('HeapProfiler.enable');
    await client.send('HeapProfiler.collectGarbage');

    const sizes: number[] = [];
    client.on('HeapProfiler.addHeapSnapshotChunk', (e: { chunk: string }) => {
      sizes.push(e.chunk.length);
      totalSize += e.chunk.length;
    });

    await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    await client.detach();

    return {
      totalSize,
      summary: `Heap snapshot: ${(totalSize / 1024 / 1024).toFixed(2)} MB in ${chunks} chunks. Use Chrome DevTools Memory panel to analyze the full snapshot.`,
    };
  }

  // ─── Performance ──────────────────────────────────────────────────────────
  private perfSession: Awaited<ReturnType<Page['createCDPSession']>> | null = null;

  async startPerformanceTrace(): Promise<void> {
    const page = await this.getPage();
    this.perfSession = await page.createCDPSession();
    await this.perfSession.send('Tracing.start', {
      categories: 'devtools.timeline,blink.user_timing,v8.execute,disabled-by-default-devtools.timeline',
      transferMode: 'ReturnAsStream',
    });
  }

  async stopPerformanceTrace(): Promise<{ summary: string }> {
    if (!this.perfSession) throw new Error('No performance trace running. Call startPerformanceTrace first.');
    await this.perfSession.send('Tracing.end');
    await this.perfSession.detach();
    this.perfSession = null;
    return { summary: 'Performance trace captured. Use Chrome DevTools Performance panel to analyze the full trace.' };
  }

  // ─── Emulation ────────────────────────────────────────────────────────────
  async emulate(device: string): Promise<void> {
    const page = await this.getPage();
    // Common device presets
    const devices: Record<string, { width: number; height: number; userAgent: string; deviceScaleFactor: number }> = {
      'iPhone 12': { width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)', deviceScaleFactor: 3 },
      'iPad': { width: 768, height: 1024, userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)', deviceScaleFactor: 2 },
      'Galaxy S21': { width: 360, height: 800, userAgent: 'Mozilla/5.0 (Linux; Android 11; Samsung Galaxy S21)', deviceScaleFactor: 3 },
      'desktop': { width: 1280, height: 720, userAgent: '', deviceScaleFactor: 1 },
    };
    const preset = devices[device];
    if (!preset) throw new Error(`Unknown device "${device}". Available: ${Object.keys(devices).join(', ')}`);
    await page.setViewport({ width: preset.width, height: preset.height, deviceScaleFactor: preset.deviceScaleFactor });
    if (preset.userAgent) await page.setUserAgent(preset.userAgent);
  }

  async dispose(): Promise<void> {
    if (this.perfSession) {
      await this.perfSession.detach().catch(() => {});
      this.perfSession = null;
    }
    if (this.browser) {
      await this.browser.disconnect();
      this.browser = null;
    }
  }
}
