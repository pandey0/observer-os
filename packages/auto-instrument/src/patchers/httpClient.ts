import * as http from 'http';
import * as https from 'https';
import type { EventQueue } from '../queue';

let seq = 0;

function wrapRequest(
  origFn: typeof http.request,
  protocol: 'http' | 'https',
  queue: EventQueue,
): typeof http.request {
  return function observedRequest(...args: Parameters<typeof http.request>) {
    const urlOrOpts = args[0];
    let method = 'GET', host = 'unknown', path = '/';
    try {
      if (typeof urlOrOpts === 'string' || urlOrOpts instanceof URL) {
        const u = new URL(urlOrOpts.toString());
        host = u.host; path = u.pathname;
        method = ((args[1] as http.RequestOptions)?.method ?? 'GET').toUpperCase();
      } else {
        const o = urlOrOpts as http.RequestOptions;
        host = `${o.hostname ?? o.host ?? 'unknown'}${o.port ? ':' + String(o.port) : ''}`;
        path = o.path ?? '/'; method = (o.method ?? 'GET').toUpperCase();
      }
    } catch { /* ignore parse errors */ }

    // Skip Observer daemon calls
    if (host.includes('localhost:4000') || host.includes('127.0.0.1:4000')) {
      return origFn(...args);
    }

    const nodeId = `http-client:${++seq}`;
    const startedAt = Date.now();

    queue.push({
      type: 'observer.http-client/request.started',
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      severity: 'DEBUG',
      payload: { method, host, path, protocol },
    });

    const req = origFn(...args);
    req.on('response', (res: http.IncomingMessage) => {
      const duration = Date.now() - startedAt;
      const status = res.statusCode ?? 0;
      queue.push({
        type: status >= 500 ? 'observer.http-client/request.failed' : 'observer.http-client/request.completed',
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        severity: status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'DEBUG',
        payload: { method, host, path, status, duration, durationMs: duration },
      });
    });
    req.on('error', (err: Error) => {
      queue.push({
        type: 'observer.http-client/request.failed',
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        severity: 'ERROR',
        payload: { method, host, path, errorName: err.name, errorMessage: err.message, duration: Date.now() - startedAt },
      });
    });
    return req;
  } as typeof http.request;
}

export function patchHttpClient(queue: EventQueue): boolean {
  try {
    const origHttp = http.request.bind(http);
    const origHttps = https.request.bind(https);
    Object.defineProperty(http, 'request', { value: wrapRequest(origHttp, 'http', queue), writable: true, configurable: true });
    Object.defineProperty(https, 'request', { value: wrapRequest(origHttps, 'https', queue), writable: true, configurable: true });
    return true;
  } catch {
    return false;
  }
}
