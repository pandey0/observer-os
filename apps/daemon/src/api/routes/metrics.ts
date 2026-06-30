import type { FastifyInstance } from 'fastify';
import type { ObserverCore } from '@observer-os/core';
import type { AlertEngine } from '@observer-os/core';

export function registerMetricsRoutes(
  app: FastifyInstance,
  core: ObserverCore,
  alerts: AlertEngine,
  startedAt: number,
): void {
  app.get('/api/metrics', async (_req, reply) => {
    const sessions = core.sessions.list();
    const statuses = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED', 'CREATING'] as const;
    const byStatus = Object.fromEntries(
      statuses.map(s => [s, sessions.filter(x => x.status === s).length]),
    );
    const totalEvents = sessions.reduce((sum, s) => sum + s.eventCount, 0);
    const totalFires = alerts.listFires(1000).length;
    const mem = process.memoryUsage();
    const uptime = Math.floor((Date.now() - startedAt) / 1000);

    const lines = [
      '# HELP observer_sessions_total Sessions by status',
      '# TYPE observer_sessions_total gauge',
      ...statuses.map(s => `observer_sessions_total{status="${s}"} ${byStatus[s]}`),
      '# HELP observer_events_total Total events across all sessions',
      '# TYPE observer_events_total gauge',
      `observer_events_total ${totalEvents}`,
      '# HELP observer_alerts_fired_total Total alert fires',
      '# TYPE observer_alerts_fired_total gauge',
      `observer_alerts_fired_total ${totalFires}`,
      '# HELP observer_memory_rss_bytes Process RSS memory bytes',
      '# TYPE observer_memory_rss_bytes gauge',
      `observer_memory_rss_bytes ${mem.rss}`,
      '# HELP observer_uptime_seconds Daemon uptime in seconds',
      '# TYPE observer_uptime_seconds gauge',
      `observer_uptime_seconds ${uptime}`,
    ];

    void reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(lines.join('\n') + '\n');
  });
}
