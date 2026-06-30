import type { FastifyInstance } from 'fastify';
import type { ObserverCore } from '@observer-os/core';
import { asNodeId, asEventId, PerformanceAnalyzer, SessionSearcher } from '@observer-os/core';
import type { PluginRegistry } from '@observer-os/sdk';
import { ContextEngine } from '@observer-os/context-engine';
import type { ContextRequest } from '@observer-os/context-engine';
import { CreateSessionSchema, EmitEventSchema } from '../validators.js';
import { generateShareHtml } from '../../templates/shareTemplate.js';
import type { ShareData } from '../../templates/shareTemplate.js';

const perfAnalyzer = new PerformanceAnalyzer();
const contextEngine = new ContextEngine();
const searcher = new SessionSearcher();

import {
  toApiSession,
  type CreateSessionBody,
  type EmitEventBody,
  type ApiSession,
  type EventsResponse,
  type NodesResponse,
} from '../types.js';

export function registerSessionRoutes(
  app: FastifyInstance,
  core: ObserverCore,
  registry: PluginRegistry,
): void {

  // nodeCount on the Session object is stale — compute live from projection engine
  const withLiveNodeCount = (s: ReturnType<typeof core.sessions.get>): ApiSession => {
    const base = toApiSession(s!);
    return { ...base, nodeCount: core.graph.getNodes(s!.id).length };
  };

  // ─── Search sessions ────────────────────────────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>(
    '/api/sessions/search',
    async (req, reply) => {
      const { q, domain, status, tag, from, to } = req.query;
      const sessions = core.sessions.list();
      const results = searcher.search(
        { q, domain, status, tag,
          from: from ? Number(from) : undefined,
          to: to ? Number(to) : undefined },
        sessions,
        (id) => core.graph.getNodes(id as never),
        (id) => core.events.read(id as never),
      );
      return reply.send({ query: req.query, total: results.length, results });
    }
  );

  // ─── List sessions ──────────────────────────────────────────────────────────
  app.get<{ Reply: ApiSession[] }>('/api/sessions', async (_req, reply) => {
    return reply.send(core.sessions.list().map((s) => withLiveNodeCount(s)));
  });

  // ─── Create session ─────────────────────────────────────────────────────────
  app.post<{ Body: CreateSessionBody; Reply: ApiSession | { error: string } }>(
    '/api/sessions',
    async (req, reply) => {
      const parsed = CreateSessionSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
      const body = parsed.data;
      const session = core.sessions.create({
        name: typeof body.name === 'string' ? body.name : undefined,
        tags: Array.isArray(body.tags) ? body.tags : [],
      });

      // Connect all registered plugins into this session
      await registry.connectAll(session);

      return reply.status(201).send(withLiveNodeCount(session));
    }
  );

  // ─── Session share (self-contained HTML) ────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/share',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const nodes = core.graph.getNodes(sessionId as never);
      const events = core.events.read(sessionId as never);

      const shareData: ShareData = {
        session: {
          id: sessionId,
          name: session.name,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          tags: session.tags ? [...session.tags] : [],
          nodeCount: nodes.length,
          eventCount: events.length,
        },
        nodes: nodes.map((n) => ({
          id: n.id as string,
          type: n.type,
          domain: n.domain as string,
          status: n.status,
          createdAt: n.createdAt,
        })),
        events: events.slice(0, 1000).map((e) => ({
          id: e.id as string,
          type: e.type,
          sourceNodeId: e.sourceNodeId as string,
          occurredAt: e.occurredAt,
          severity: e.severity ?? 'INFO',
          payload: e.payload as Record<string, unknown> | undefined,
        })),
        exportedAt: Date.now(),
      };

      const slug = session.name?.replace(/\s+/g, '-').toLowerCase() ?? sessionId;
      void reply.header('content-type', 'text/html; charset=utf-8');
      void reply.header('content-disposition', `inline; filename="${slug}-share.html"`);
      return reply.send(generateShareHtml(shareData));
    }
  );

  // ─── Default session (zero-config) ─────────────────────────────────────────
  app.get('/api/sessions/default', async (_req, reply) => {
    const sessions = core.sessions.list();
    // Return most recent ACTIVE session
    const active = sessions
      .filter(s => s.status === 'ACTIVE')
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (active) return reply.send(withLiveNodeCount(active));

    // No active session — create one
    const session = core.sessions.create({ name: 'Default Session' });
    await registry.connectAll(session);
    return reply.status(201).send(withLiveNodeCount(session));
  });

  // ─── Get session ────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string }; Reply: ApiSession | { error: string } }>(
    '/api/sessions/:id',
    async (req, reply) => {
      const session = core.sessions.get(req.params['id'] as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      return reply.send(withLiveNodeCount(session));
    }
  );

  // ─── End session ────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string }; Reply: ApiSession | { error: string } }>(
    '/api/sessions/:id',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      await registry.disconnectAll();
      const ended = core.sessions.end(sessionId as never);
      return reply.send(withLiveNodeCount(ended));
    }
  );

  // ─── Emit event (for testing / SDK-less plugin use) ────────────────────────
  app.post<{
    Params: { id: string };
    Body: EmitEventBody;
    Reply: { id: string; sequenceNumber: number } | { error: string };
  }>(
    '/api/sessions/:id/events',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      if (session.status !== 'ACTIVE') {
        return reply.status(409).send({ error: `Session status is ${session.status}` });
      }

      const parsed = EmitEventSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
      const body = parsed.data;
      try {
        const event = core.sessions.emit(sessionId as never, {
          type: body.type,
          sourceNodeId: asNodeId(body.sourceNodeId),
          affectedNodeIds: body.affectedNodeIds?.map(asNodeId),
          occurredAt: body.occurredAt ?? Date.now(),
          payload: body.payload,
          causedByEventId: body.causedByEventId ? asEventId(body.causedByEventId) : undefined,
          correlationId: body.correlationId,
          severity: body.severity as never,
          schemaVersion: body.schemaVersion,
        });
        return reply.status(201).send({ id: event.id as string, sequenceNumber: event.sequenceNumber });
      } catch (err) {
        return reply.status(400).send({ error: String(err) });
      }
    }
  );

  // ─── Get events ─────────────────────────────────────────────────────────────
  app.get<{
    Params: { id: string };
    Querystring: { afterSequence?: string; limit?: string };
    Reply: EventsResponse | { error: string };
  }>(
    '/api/sessions/:id/events',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const afterSequence = req.query['afterSequence'] ? Number(req.query['afterSequence']) : undefined;
      const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;

      const events = core.events.read(sessionId as never, { afterSequence, limit });
      return reply.send({ sessionId, total: events.length, events });
    }
  );

  // ─── Get graph nodes ────────────────────────────────────────────────────────
  app.get<{
    Params: { id: string };
    Reply: NodesResponse | { error: string };
  }>(
    '/api/sessions/:id/nodes',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const nodes = core.graph.getNodes(sessionId as never);
      return reply.send({ sessionId, total: nodes.length, nodes });
    }
  );

  // ─── Context Engine ─────────────────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: ContextRequest; Reply: unknown }>(
    '/api/sessions/:id/context',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const body = req.body as Partial<ContextRequest>;
      if (!body?.anchor?.nodeId) {
        return reply.status(400).send({ error: 'anchor.nodeId required' });
      }

      const request: ContextRequest = {
        anchor: { type: body.anchor.type ?? 'node', nodeId: body.anchor.nodeId },
        depth: body.depth ?? 'DETAILED',
        format: body.format ?? 'MARKDOWN',
        sessionId: sessionId as never,
      };

      const nodes = core.graph.getNodes(sessionId as never);
      const events = core.events.read(sessionId as never);

      try {
        const pkg = contextEngine.build(request, { nodes, events });
        return reply.send(pkg);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(422).send({ error: msg });
      }
    }
  );

  // ─── Performance analysis ───────────────────────────────────────────────────
  app.get<{ Params: { id: string }; Reply: unknown }>(
    '/api/sessions/:id/performance',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const events = core.events.read(sessionId as never);
      return reply.send(perfAnalyzer.analyze(sessionId, events));
    }
  );

  // ─── Session export ─────────────────────────────────────────────────────────
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>(
    '/api/sessions/:id/export',
    async (req, reply) => {
      const sessionId = req.params['id'];
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const format = (req.query['format'] ?? 'json') as string;
      const nodes  = core.graph.getNodes(sessionId as never);
      const events = core.events.read(sessionId as never);

      const slug = session.name?.replace(/\s+/g, '-').toLowerCase() ?? sessionId;

      if (format === 'markdown') {
        const lines: string[] = [
          `# Session: ${session.name ?? sessionId}`,
          ``,
          `- **ID**: ${sessionId}`,
          `- **Status**: ${session.status}`,
          `- **Created**: ${new Date(session.startedAt).toISOString()}`,
          `- **Nodes**: ${nodes.length}`,
          `- **Events**: ${events.length}`,
          ``,
          `## Nodes`,
          ``,
          ...nodes.map((n) => `- \`${n.id}\` **${n.type}** (${n.domain}) — status: ${n.status}`),
          ``,
          `## Events`,
          ``,
          ...events.map((e) => {
            const ts = new Date(e.occurredAt).toISOString().replace('T', ' ').slice(0, 19);
            return `- \`${ts}\` **${e.type}** [${e.severity}] → \`${e.sourceNodeId}\``;
          }),
        ];

        void reply.header('content-type', 'text/markdown; charset=utf-8');
        void reply.header('content-disposition', `attachment; filename="${slug}.md"`);
        return reply.send(lines.join('\n'));
      }

      // Default: JSON export
      void reply.header('content-type', 'application/json');
      void reply.header('content-disposition', `attachment; filename="${slug}.json"`);
      return reply.send(JSON.stringify({ session, nodes, events }, null, 2));
    }
  );

  // ─── AI query ───────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { question: string; depth?: string; anchorNodeId?: string } }>(
    '/api/sessions/:id/query',
    async (req, reply) => {
      const { id: sessionId } = req.params;
      const session = core.sessions.get(sessionId as never);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const { question, depth, anchorNodeId } = req.body ?? {};
      if (!question) return reply.status(400).send({ error: 'question required' });

      const nodes = core.graph.getNodes(sessionId as never);
      const events = core.events.read(sessionId as never);

      // Anchor selection
      let anchorId = anchorNodeId;
      if (!anchorId) {
        const { selectAnchorNode } = await import('@observer-os/ai-query');
        const anchorNode = selectAnchorNode(question, nodes);
        anchorId = anchorNode?.id as string | undefined;
      }
      if (!anchorId && nodes.length > 0) anchorId = nodes[0]?.id as string;
      if (!anchorId) return reply.status(422).send({ error: 'No nodes in session' });

      const request: ContextRequest = {
        anchor: { type: 'node' as const, nodeId: anchorId },
        depth: (depth as 'SURFACE' | 'DETAILED' | 'FULL') ?? 'DETAILED',
        format: 'MARKDOWN' as const,
        sessionId: sessionId as never,
      };

      const pkg = contextEngine.build(request, { nodes, events });

      const wantsStream = (req.query as Record<string, string>)['stream'] === 'true';

      if (wantsStream && process.env['ANTHROPIC_API_KEY']) {
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('Access-Control-Allow-Origin', '*');
        try {
          // @ts-expect-error — optional runtime dep; resolved transitively via @observer-os/ai-query
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
          const anthropic = new Anthropic();
          const stream = anthropic.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: 'You are an Observer OS runtime diagnostics assistant. Answer only from the provided context. Be concise.',
            messages: [{ role: 'user', content: `Context:\n${pkg.markdownContent as string}\n\nQuestion: ${question}` }],
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', text: event.delta.text })}\n\n`);
            }
          }
          const final = await stream.finalMessage();
          reply.raw.write(`data: ${JSON.stringify({ type: 'done', tokensUsed: final.usage.input_tokens + final.usage.output_tokens })}\n\n`);
          reply.raw.end();
          return;
        } catch (err) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) })}\n\n`);
          reply.raw.end();
          return;
        }
      }

      if (!process.env['ANTHROPIC_API_KEY']) {
        return reply.status(503).send({
          error: 'AI_UNAVAILABLE',
          hint: 'Set ANTHROPIC_API_KEY environment variable to enable AI answers',
          contextPackage: pkg,
        });
      }

      try {
        const { queryContext } = await import('@observer-os/ai-query');
        const result = await queryContext(pkg, question);
        return reply.send({ ...result, contextPackage: pkg });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg, contextPackage: pkg });
      }
    }
  );
}
