import type { FastifyInstance } from 'fastify';
import type { ObserverCore } from '@observer-os/core';
import type { AnnotationStore } from '../../store/AnnotationStore.js';
import { CreateAnnotationSchema } from '../validators.js';

export function registerAnnotationRoutes(
  app: FastifyInstance,
  core: ObserverCore,
  store: AnnotationStore,
): void {
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/annotations',
    async (req, reply) => {
      const session = core.sessions.get(req.params['id'] as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      return reply.send({ annotations: store.list(req.params['id']) });
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/sessions/:id/annotations',
    async (req, reply) => {
      const session = core.sessions.get(req.params['id'] as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      const parsed = CreateAnnotationSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
      const annotation = store.add({ sessionId: req.params['id'], ...parsed.data });
      return reply.status(201).send(annotation);
    },
  );

  app.delete<{ Params: { id: string; annotationId: string } }>(
    '/api/sessions/:id/annotations/:annotationId',
    async (req, reply) => {
      const session = core.sessions.get(req.params['id'] as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      const deleted = store.delete(req.params['id'], req.params['annotationId']);
      if (!deleted) return reply.status(404).send({ error: 'Annotation not found' });
      return reply.status(204).send();
    },
  );
}
