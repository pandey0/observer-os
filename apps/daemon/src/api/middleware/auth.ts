import type { FastifyRequest, FastifyReply } from 'fastify';

export function createAuthMiddleware(apiKey: string | undefined) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!apiKey) return; // dev mode: no auth
    // Skip auth for health + auth routes
    if (request.url === '/api/health' || request.url.startsWith('/api/auth')) return;
    const bearer = request.headers['authorization']?.replace(/^Bearer\s+/i, '');
    const xKey = request.headers['x-api-key'] as string | undefined;
    const provided = bearer ?? xKey;
    if (!provided || provided !== apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  };
}
