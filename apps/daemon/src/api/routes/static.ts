import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function registerStaticRoutes(app: FastifyInstance): Promise<void> {
  // Explorer dist is at apps/explorer/dist — relative to this compiled file at
  // apps/daemon/dist/api/routes/static.js → ../../.. → apps/daemon/dist → ../.. → apps/
  const explorerDist = join(__dirname, '..', '..', '..', 'public');

  if (!existsSync(explorerDist)) {
    // Dev mode — Explorer runs on Vite dev server; skip static serving
    app.get('/', async (_req, reply) => {
      return reply.send({
        message: 'Observer OS Daemon',
        ui: 'Run `pnpm --filter @observer-os/explorer dev` for the Explorer UI',
        api: 'http://localhost:4000/api',
      });
    });
    return;
  }

  await app.register(fastifyStatic, {
    root: explorerDist,
    prefix: '/',
    // SPA fallback — serve index.html for unknown paths
    wildcard: false,
  });

  // SPA catch-all: unknown routes → index.html
  app.setNotFoundHandler((_req, reply) => {
    return reply.sendFile('index.html');
  });
}
