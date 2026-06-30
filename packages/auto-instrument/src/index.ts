// This file runs via node --require @observer-os/auto-instrument
// It MUST be synchronous-safe — no top-level await

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventQueue } from './queue';
import { getDefaultSession, postEvent, closeSession } from './client';
import { patchHttpServer } from './patchers/httpServer';
import { patchHttpClient } from './patchers/httpClient';
import { patchPostgres } from './patchers/postgres';
import { patchIoRedis } from './patchers/ioredis';
import { patchNodeRedis } from './patchers/nodeRedis';
import { patchWsServer } from './patchers/ws';
import { patchConsole } from './patchers/console';
import { patchMysql } from './patchers/mysql';

const DAEMON_URL = process.env['OBSERVER_URL'] ?? 'http://localhost:4000';
const API_KEY = process.env['OBSERVER_API_KEY'] ?? undefined;

// tsx runs --require hooks in BOTH a coordinator thread and a worker thread (same PID,
// separate V8 isolates). Use a temp-file lock keyed on PID so only the FIRST thread
// to run this hook initializes — the other silently skips.
const lockFile = path.join(os.tmpdir(), `.obs-init-${process.pid}`);
let shouldInit = false;
try {
  fs.writeFileSync(lockFile, '', { flag: 'wx' }); // atomic create — fails if exists
  shouldInit = true;
  // Remove on exit so next run of the same PID (impossible, but cleanup) starts fresh
  process.on('exit', () => { try { fs.unlinkSync(lockFile); } catch { /* ignore */ } });
} catch {
  // Another thread already initialized — skip
}

if (shouldInit) {
  const queue = new EventQueue();
  let sessionId: string | null = null;
  const detected: string[] = [];

  // ─── Patch synchronously (before user code) ────────────────────────────
  if (patchHttpServer(queue)) detected.push('http-server');
  patchHttpClient(queue);
  if (patchPostgres(queue)) detected.push('postgres');
  if (patchMysql(queue)) detected.push('mysql2');
  if (patchIoRedis(queue)) detected.push('ioredis');
  if (patchNodeRedis(queue)) detected.push('node-redis');
  if (patchWsServer(queue)) detected.push('ws');
  if (patchConsole(queue)) detected.push('console');

  // ─── Connect to daemon async ──────────────────────────────────────────
  getDefaultSession(DAEMON_URL, API_KEY)
    .then((session) => {
      sessionId = session.id;
      queue.setFlushHandler((event) => {
        postEvent(DAEMON_URL, sessionId!, event, API_KEY);
      });
      process.stderr.write(
        `[Observer OS] auto-instrumented (${detected.length > 0 ? detected.join(', ') : 'http'}) → session ${sessionId}\n`,
      );
    })
    .catch(() => {
      process.stderr.write(
        `[Observer OS] warning: daemon not reachable at ${DAEMON_URL} — events dropped\n`,
      );
    });

  // ─── Mark session COMPLETED on clean exit ──────────────────────────────
  async function shutdown(signal: string) {
    if (sessionId) {
      process.stderr.write(`[Observer OS] closing session ${sessionId} (${signal})\n`);
      await closeSession(DAEMON_URL, sessionId, API_KEY);
    }
    process.exit(0);
  }
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
