import type { FastifyInstance } from 'fastify';
import type { ObserverCore } from '@observer-os/core';
import type { HealthResponse } from '../types.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  core: ObserverCore,
  startedAt: number,
): void {
  app.get('/api/health', async (_req, reply) => {
    const sessions = core.sessions.list();
    const activeSessions = sessions.filter((s) => s.status === 'ACTIVE');
    const totalEvents = sessions.reduce((sum, s) => sum + s.eventCount, 0);
    const mem = process.memoryUsage();
    return reply.send({
      status: 'ok',
      version: '0.4.0',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      sessions: sessions.length,
      activeSessions: activeSessions.length,
      totalEvents,
      memoryMb: Math.round(mem.rss / 1024 / 1024),
    });
  });
}
