import type { FastifyInstance } from 'fastify';
import { CdpBridge } from '@observer-os/plugin-cdp';

// Single shared bridge per daemon process
const bridge = new CdpBridge();

export function registerCdpRoutes(app: FastifyInstance): void {

  // GET /api/cdp/status
  app.get('/api/cdp/status', async (_req, reply) => {
    const status = await bridge.status();
    return reply.send(status);
  });

  // GET /api/cdp/pages
  app.get('/api/cdp/pages', async (_req, reply) => {
    try {
      const pages = await bridge.listPages();
      return reply.send({ pages });
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/pages/select
  app.post<{ Body: { id: number } }>('/api/cdp/pages/select', async (req, reply) => {
    const { id } = req.body ?? {};
    if (typeof id !== 'number') return reply.status(400).send({ error: 'id required (number)' });
    await bridge.selectPage(id);
    return reply.send({ ok: true });
  });

  // POST /api/cdp/pages/new
  app.post<{ Body: { url?: string } }>('/api/cdp/pages/new', async (req, reply) => {
    try {
      const page = await bridge.newPage(req.body?.url);
      return reply.status(201).send(page);
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/navigate
  app.post<{ Body: { url: string } }>('/api/cdp/navigate', async (req, reply) => {
    const { url } = req.body ?? {};
    if (!url) return reply.status(400).send({ error: 'url required' });
    try {
      const result = await bridge.navigate(url);
      return reply.send(result);
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/screenshot
  app.post<{ Body: { selector?: string } }>('/api/cdp/screenshot', async (req, reply) => {
    try {
      const base64 = await bridge.takeScreenshot(req.body?.selector);
      return reply.send({ data: base64, mimeType: 'image/png' });
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/snapshot
  app.post('/api/cdp/snapshot', async (_req, reply) => {
    try {
      const snapshot = await bridge.takeSnapshot();
      return reply.send({ snapshot });
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/evaluate
  app.post<{ Body: { script: string } }>('/api/cdp/evaluate', async (req, reply) => {
    const { script } = req.body ?? {};
    if (!script) return reply.status(400).send({ error: 'script required' });
    try {
      const result = await bridge.evaluate(script);
      return reply.send({ result });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // POST /api/cdp/click
  app.post<{ Body: { selector: string } }>('/api/cdp/click', async (req, reply) => {
    const { selector } = req.body ?? {};
    if (!selector) return reply.status(400).send({ error: 'selector required' });
    try {
      await bridge.click(selector);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/fill
  app.post<{ Body: { selector: string; value: string } }>('/api/cdp/fill', async (req, reply) => {
    const { selector, value } = req.body ?? {};
    if (!selector || value === undefined) return reply.status(400).send({ error: 'selector and value required' });
    try {
      await bridge.fill(selector, value);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/press-key
  app.post<{ Body: { key: string } }>('/api/cdp/press-key', async (req, reply) => {
    const { key } = req.body ?? {};
    if (!key) return reply.status(400).send({ error: 'key required' });
    try {
      await bridge.pressKey(key);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // GET /api/cdp/console
  app.get<{ Querystring: { limit?: string } }>('/api/cdp/console', async (req, reply) => {
    const limit = parseInt(req.query.limit ?? '50', 10);
    return reply.send({ messages: bridge.getConsoleMessages(limit) });
  });

  // DELETE /api/cdp/console
  app.delete('/api/cdp/console', async (_req, reply) => {
    bridge.clearConsole();
    return reply.send({ ok: true });
  });

  // GET /api/cdp/network
  app.get<{ Querystring: { limit?: string } }>('/api/cdp/network', async (req, reply) => {
    const limit = parseInt(req.query.limit ?? '50', 10);
    return reply.send({ requests: bridge.getNetworkRequests(limit) });
  });

  // POST /api/cdp/heapsnapshot
  app.post('/api/cdp/heapsnapshot', async (_req, reply) => {
    try {
      const result = await bridge.takeHeapSnapshot();
      return reply.send(result);
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/performance/start
  app.post('/api/cdp/performance/start', async (_req, reply) => {
    try {
      await bridge.startPerformanceTrace();
      return reply.send({ ok: true, message: 'Performance trace started' });
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/performance/stop
  app.post('/api/cdp/performance/stop', async (_req, reply) => {
    try {
      const result = await bridge.stopPerformanceTrace();
      return reply.send(result);
    } catch (err) {
      return reply.status(503).send({ error: String(err) });
    }
  });

  // POST /api/cdp/emulate
  app.post<{ Body: { device: string } }>('/api/cdp/emulate', async (req, reply) => {
    const { device } = req.body ?? {};
    if (!device) return reply.status(400).send({ error: 'device required. Options: iPhone 12, iPad, Galaxy S21, desktop' });
    try {
      await bridge.emulate(device);
      return reply.send({ ok: true, device });
    } catch (err) {
      return reply.status(400).send({ error: String(err) });
    }
  });
}
