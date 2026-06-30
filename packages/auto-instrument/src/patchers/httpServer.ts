import * as http from 'http';
import * as https from 'https';
import type { EventQueue } from '../queue';
import { correlationStorage, newCorrelationId } from '../context';

const registeredServers = new WeakSet<object>();

// Max bytes to capture from request/response body — keeps events small
const BODY_LIMIT = 8 * 1024; // 8KB

function tapRequestBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const contentType = req.headers['content-type'] ?? '';
    // Only capture text-like bodies
    if (
      !contentType.includes('json') &&
      !contentType.includes('text') &&
      !contentType.includes('form')
    ) {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;

    req.on('data', (chunk: Buffer) => {
      if (truncated) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        truncated = true;
        chunks.push(chunk.slice(0, BODY_LIMIT - (size - chunk.length)));
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(truncated ? raw + '…[truncated]' : raw);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function tapResponseBody(res: http.ServerResponse): Promise<string | null> {
  return new Promise((resolve) => {
    const origWrite = res.write.bind(res) as typeof res.write;
    const origEnd = res.end.bind(res) as typeof res.end;
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let resolved = false;

    function capture(chunk: unknown) {
      if (truncated || !chunk) return;
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk));
      size += buf.length;
      if (size > BODY_LIMIT) {
        truncated = true;
        chunks.push(buf.slice(0, BODY_LIMIT - (size - buf.length)));
      } else {
        chunks.push(buf);
      }
    }

    function done() {
      if (resolved) return;
      resolved = true;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(truncated ? raw + '…[truncated]' : raw || null);
      } catch {
        resolve(null);
      }
    }

    // Patch write/end to observe without blocking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).write = function interceptWrite(...args: any[]) {
      capture(args[0]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return origWrite(...(args as Parameters<typeof origWrite>));
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end = function interceptEnd(...args: any[]) {
      if (args[0] && typeof args[0] !== 'function') capture(args[0]);
      done();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return origEnd(...(args as Parameters<typeof origEnd>));
    };

    res.on('finish', done);
  });
}

export function patchHttpServer(queue: EventQueue): boolean {
  try {
    for (const mod of [http, https] as typeof http[]) {
      const proto = mod.Server.prototype as { emit: (...a: unknown[]) => boolean };
      const origEmit = proto.emit;

      proto.emit = function patchedEmit(this: http.Server, event: unknown, ...args: unknown[]) {
        if (event !== 'request') {
          return origEmit.call(this, event, ...args);
        }

        const req = args[0] as http.IncomingMessage;
        const res = args[1] as http.ServerResponse;

        // Skip Observer daemon traffic
        const host = req.headers['host'] ?? '';
        if (host.includes('4000')) {
          return origEmit.call(this, event, ...args);
        }

        // Infrastructure node — once per server
        const serverPort = (this.address() as { port?: number } | null)?.port ?? 0;
        const serverNodeId = `http-server:${serverPort || 'unknown'}`;
        if (!registeredServers.has(this)) {
          registeredServers.add(this);
          queue.push({
            type: 'observer.http-server/server.started',
            sourceNodeId: serverNodeId,
            occurredAt: Date.now(),
            severity: 'INFO',
            payload: { port: serverPort },
          });
        }

        const incomingId = req.headers['x-observer-correlation-id'] as string | undefined;
        const correlationId = incomingId ?? newCorrelationId();
        const requestNodeId = `http-server:request:${correlationId}`;
        const startedAt = Date.now();
        const method = req.method ?? 'GET';
        const url = req.url ?? '/';
        const contentType = req.headers['content-type'] ?? '';
        const contentLength = req.headers['content-length'] ?? '';

        // Emit request.started immediately with headers
        queue.push({
          type: 'observer.http-server/request.started',
          sourceNodeId: requestNodeId,
          correlationId,
          occurredAt: startedAt,
          severity: 'DEBUG',
          payload: { method, url, host, contentType, contentLength, serverNodeId },
        });

        // Tap request body (non-blocking — both we and Express get the data events)
        const bodyPromise = tapRequestBody(req);

        // Tap response body
        const resBodyPromise = tapResponseBody(res);

        res.on('finish', () => {
          const status = res.statusCode;
          const durationMs = Date.now() - startedAt;

          bodyPromise.then((reqBody) => {
            if (reqBody) {
              let parsedBody: unknown = reqBody;
              try { parsedBody = JSON.parse(reqBody); } catch { /* keep raw string */ }
              queue.push({
                type: 'observer.http-server/request.body',
                sourceNodeId: requestNodeId,
                correlationId,
                occurredAt: startedAt + 1,
                severity: 'DEBUG',
                payload: {
                  method, url,
                  body: parsedBody,
                  rawSize: contentLength ? parseInt(contentLength, 10) : reqBody.length,
                },
              });
            }
          }).catch(() => {});

          resBodyPromise.then((resBody) => {
            let parsedResBody: unknown = resBody;
            if (resBody) {
              try { parsedResBody = JSON.parse(resBody); } catch { /* keep raw */ }
            }
            queue.push({
              type: status >= 500
                ? 'observer.http-server/request.failed'
                : 'observer.http-server/request.completed',
              sourceNodeId: requestNodeId,
              correlationId,
              occurredAt: Date.now(),
              severity: status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
              payload: {
                method, url, status, durationMs,
                responseBody: parsedResBody ?? undefined,
              },
            });
          }).catch(() => {
            queue.push({
              type: status >= 500
                ? 'observer.http-server/request.failed'
                : 'observer.http-server/request.completed',
              sourceNodeId: requestNodeId,
              correlationId,
              occurredAt: Date.now(),
              severity: status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
              payload: { method, url, status, durationMs },
            });
          });
        });

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        return correlationStorage.run(correlationId, () =>
          origEmit.call(self, event, ...args)
        );
      } as typeof proto.emit;
    }
    return true;
  } catch {
    return false;
  }
}
