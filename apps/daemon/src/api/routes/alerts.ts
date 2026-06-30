import type { FastifyInstance } from 'fastify';
import type { AlertEngine, AlertRule } from '@observer-os/core';

export function registerAlertRoutes(app: FastifyInstance, alerts: AlertEngine): void {

  // ─── List rules ─────────────────────────────────────────────────────────────
  app.get('/api/alerts', async (_req, reply) => {
    return reply.send({ rules: alerts.listRules() });
  });

  // ─── Create rule ────────────────────────────────────────────────────────────
  app.post<{ Body: unknown }>('/api/alerts', async (req, reply) => {
    const body = req.body as Partial<Omit<AlertRule, 'id' | 'createdAt'>>;

    if (!body.name || !body.condition || !body.action) {
      return reply.status(400).send({ error: 'name, condition, action required' });
    }

    const rule = alerts.addRule({
      name: body.name,
      condition: body.condition,
      action: body.action,
      enabled: body.enabled ?? true,
    });

    return reply.status(201).send(rule);
  });

  // ─── Update rule ────────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/alerts/:id',
    async (req, reply) => {
      const rule = alerts.updateRule(req.params['id'], req.body as Partial<AlertRule>);
      if (!rule) return reply.status(404).send({ error: 'Rule not found' });
      return reply.send(rule);
    }
  );

  // ─── Delete rule ────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/alerts/:id',
    async (req, reply) => {
      const removed = alerts.removeRule(req.params['id']);
      if (!removed) return reply.status(404).send({ error: 'Rule not found' });
      return reply.status(204).send();
    }
  );

  // ─── List recent fires ──────────────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string } }>(
    '/api/alerts/fires',
    async (req, reply) => {
      const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
      return reply.send({ fires: alerts.listFires(limit) });
    }
  );
}
