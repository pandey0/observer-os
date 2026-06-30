import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { ObserverCore } from '@observer-os/core';
import { AlertEngine } from '@observer-os/core';
import type { PluginRegistry } from '@observer-os/sdk';
import type { DaemonConfig } from '../config/DaemonConfig.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerStreamRoutes } from './ws/stream.js';
import { registerStaticRoutes } from './routes/static.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerAnnotationRoutes } from './routes/annotations.js';
import { AnnotationStore } from '../store/AnnotationStore.js';
import { registerInjectRoute } from './routes/inject.js';
import { registerCdpRoutes } from './routes/cdp.js';

export class ApiServer {
  readonly app: FastifyInstance;
  readonly alerts: AlertEngine;
  private startedAt = Date.now();
  private readonly annotationStore = new AnnotationStore();

  constructor(
    private readonly core: ObserverCore,
    private readonly registry: PluginRegistry,
    private readonly config: DaemonConfig,
  ) {
    this.app = Fastify({
      logger: config.logLevel !== 'silent'
        ? { level: config.logLevel }
        : false,
    });
    this.alerts = new AlertEngine();

    // Subscribe alert evaluation to all events + node changes
    this.core.events.subscribeAll((event) => {
      this.alerts.evaluateEvent(event);
    });
    this.core.graph.onNodeChange((node) => {
      this.alerts.evaluateNode(node, node.sessionId);
    });
  }

  async init(): Promise<void> {
    await this.app.register(cors, {
      origin: this.config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      strictPreflight: false,
    });

    await this.app.register(websocket);

    // CORS headers for browser clients (allows any origin, needed for inject script)
    this.app.addHook('onSend', async (_request, reply) => {
      void reply.header('access-control-allow-origin', '*');
      void reply.header('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      void reply.header('access-control-allow-headers', 'content-type, authorization, x-api-key');
    });

    // Auth hook — runs before every route handler
    const authMiddleware = createAuthMiddleware(this.config.apiKey);
    this.app.addHook('preHandler', authMiddleware);

    // Rate limiter for emit endpoint: max 200 events/minute per IP
    const emitRateLimits = new Map<string, { count: number; windowStart: number }>();
    this.app.addHook('preHandler', async (request, reply) => {
      if (request.method !== 'POST' || !/\/api\/sessions\/[^/]+\/events$/.test(request.url)) return;
      const ip = request.ip ?? 'unknown';
      const now = Date.now();
      const entry = emitRateLimits.get(ip);
      if (!entry || now - entry.windowStart > 60000) {
        emitRateLimits.set(ip, { count: 1, windowStart: now });
        return;
      }
      entry.count++;
      if (entry.count > 200) {
        return reply.status(429).send({ error: 'Rate limit exceeded. Max 200 events/minute.' });
      }
    });

    registerHealthRoutes(this.app, this.core, this.startedAt);
    registerSessionRoutes(this.app, this.core, this.registry);
    registerAlertRoutes(this.app, this.alerts);
    registerStreamRoutes(this.app, this.core);
    registerMetricsRoutes(this.app, this.core, this.alerts, this.startedAt);
    registerAnnotationRoutes(this.app, this.core, this.annotationStore);
    await registerStaticRoutes(this.app);
    registerInjectRoute(this.app, this.config.port);
    registerCdpRoutes(this.app);

    await this.app.ready();
  }

  async listen(): Promise<string> {
    // Zero-config: ensure at least one ACTIVE session exists on startup
    const sessions = this.core.sessions.list();
    const hasActive = sessions.some(s => s.status === 'ACTIVE');
    if (!hasActive) {
      const session = this.core.sessions.create({ name: 'Default Session' });
      await this.registry.connectAll(session);
    }
    return this.app.listen({ port: this.config.port, host: this.config.host });
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}
