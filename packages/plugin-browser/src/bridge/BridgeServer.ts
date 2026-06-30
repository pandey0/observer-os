import { createServer } from 'http';
import type { Server, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ObserverSDK } from '@observer-os/sdk';
import type { EmitInput } from '@observer-os/core';
import { asNodeId } from '@observer-os/core';

export interface BridgeConfig {
  readonly port: number;
  readonly host: string;
  readonly sessionId: string;
  readonly corsOrigins: string[];
}

export interface BrowserEmitPayload {
  readonly type: string;
  readonly sourceNodeId: string;
  readonly occurredAt: number;
  readonly payload: Record<string, unknown>;
  readonly correlationId?: string;
  readonly causedByEventId?: string;
  readonly severity?: EmitInput['severity'];
  readonly schemaVersion?: string;
}

export interface BridgeEventBatch {
  readonly sessionId: string;
  readonly events: BrowserEmitPayload[];
}

export class BridgeServer {
  private server: Server | null = null;
  private injectScript: string | null = null;

  constructor(
    private readonly sdk: ObserverSDK,
    private readonly config: BridgeConfig,
  ) {}

  async start(): Promise<void> {
    this.injectScript = this.loadInjectScript();

    this.server = createServer((req, res) => {
      this.setCorsHeaders(res, req);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url === '/observer-inject.js') {
        this.serveInjectScript(res);
        return;
      }

      if (req.method === 'GET' && req.url === '/observer-config') {
        this.serveConfig(res);
        return;
      }

      if (req.method === 'POST' && req.url === '/events') {
        this.handleEvents(req, res);
        return;
      }

      res.writeHead(404).end('Not found');
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => resolve());
      this.server!.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close(err => (err ? reject(err) : resolve()));
    });
    this.server = null;
  }

  get address(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  private serveInjectScript(res: ServerResponse): void {
    if (!this.injectScript) {
      res.writeHead(503).end('Inject script not built — run pnpm build:inject');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(this.injectScript);
  }

  private serveConfig(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sessionId: this.config.sessionId,
      bridgeUrl: this.address,
    }));
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const batch = JSON.parse(body) as BridgeEventBatch;
        if (!Array.isArray(batch.events)) throw new Error('Missing events array');

        for (const ev of batch.events) {
          this.sdk.emit({
            type: ev.type,
            sourceNodeId: asNodeId(ev.sourceNodeId),
            occurredAt: ev.occurredAt,
            payload: ev.payload,
            correlationId: ev.correlationId,
            severity: ev.severity,
            schemaVersion: ev.schemaVersion,
          });
        }

        res.writeHead(204).end();
      } catch (err) {
        res.writeHead(400).end(JSON.stringify({ error: String(err) }));
      }
    });
    req.on('error', () => res.writeHead(400).end());
  }

  private setCorsHeaders(res: ServerResponse, req: IncomingMessage): void {
    const origin = req.headers['origin'] ?? '*';
    const allowed = this.config.corsOrigins.length === 0
      || this.config.corsOrigins.includes(origin as string)
      || this.config.corsOrigins.includes('*');

    res.setHeader('Access-Control-Allow-Origin', allowed ? (origin as string) : '');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private loadInjectScript(): string | null {
    try {
      const __dir = dirname(fileURLToPath(import.meta.url));
      // dist/browser-inject.js is built by esbuild (scripts/build-inject.js)
      return readFileSync(join(__dir, 'browser-inject.js'), 'utf-8');
    } catch {
      return null;
    }
  }
}
