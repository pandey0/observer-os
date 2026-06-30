import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { initDb, pool } from './db.js';
import { redis } from './cache.js';
import { authRouter } from './routes/auth.js';
import { workspacesRouter } from './routes/workspaces.js';
import { createTasksRouter } from './routes/tasks.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

const app = express();
const httpServer = createServer(app);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', exposedHeaders: ['Authorization'] }));
app.use(express.json());
app.use(express.static('public'));

// ─── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
// rooms: projectId → Set of subscribed clients
const rooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws) => {
  const subscriptions = new Set<string>();

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; projectId?: string };
      if (msg.type === 'subscribe' && msg.projectId) {
        subscriptions.add(msg.projectId);
        if (!rooms.has(msg.projectId)) rooms.set(msg.projectId, new Set());
        rooms.get(msg.projectId)!.add(ws);
        ws.send(JSON.stringify({ type: 'subscribed', projectId: msg.projectId }));
      } else if (msg.type === 'unsubscribe' && msg.projectId) {
        subscriptions.delete(msg.projectId);
        rooms.get(msg.projectId)?.delete(ws);
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch { /* ignore invalid JSON */ }
  });

  ws.on('close', () => {
    for (const projectId of subscriptions) {
      rooms.get(projectId)?.delete(ws);
    }
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), connections: wss.clients.size });
});

app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api', createTasksRouter(wss, rooms));

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await initDb();
  await redis.connect().catch(() => console.warn('[redis] not connected — sessions and cache disabled'));

  httpServer.listen(PORT, () => {
    console.log(`
  Task Manager API
  http://localhost:${PORT}/api

  Test users (password: "password123"):
    alice@acme.com  — admin
    bob@acme.com    — member
    carol@acme.com  — member

  Workspace: acme
  Projects:  web, mobile
    `);
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
