import * as http from 'node:http';
import * as https from 'node:https';
import { stableNodeId, getCurrentCorrelationId } from '@observer-os/sdk';
import type { ObserverSDK } from '@observer-os/sdk';
import { HTTP_EVENTS } from '../node-types.js';

export interface HttpPluginOptions {
  getCorrelationId?: () => string | undefined;
  skipHosts?: string[];
}

const DEFAULT_SKIP_HOSTS = ['localhost:4000', '127.0.0.1:4000'];

type RequestFn = typeof http.request;

function parseRequestArgs(
  args: Parameters<RequestFn>,
): { method: string; host: string; path: string } {
  const urlOrOpts = args[0];
  try {
    if (typeof urlOrOpts === 'string' || urlOrOpts instanceof URL) {
      const u = new URL(urlOrOpts.toString());
      const optArg = args[1] as http.RequestOptions | undefined;
      return {
        method: ((optArg?.method ?? 'GET') as string).toUpperCase(),
        host: u.host,
        path: u.pathname,
      };
    }
    const opts = urlOrOpts as http.RequestOptions;
    return {
      method: (opts.method ?? 'GET').toUpperCase(),
      host: `${opts.hostname ?? opts.host ?? 'unknown'}${opts.port ? ':' + String(opts.port) : ''}`,
      path: opts.path ?? '/',
    };
  } catch {
    return { method: 'GET', host: 'unknown', path: '/' };
  }
}

function shouldSkip(host: string, skipHosts: string[]): boolean {
  return skipHosts.some(s => host.includes(s));
}

function wrapRequest(
  originalFn: RequestFn,
  protocol: 'http' | 'https',
  sdk: ObserverSDK,
  options?: HttpPluginOptions,
): RequestFn {
  const skipHosts = [...DEFAULT_SKIP_HOSTS, ...(options?.skipHosts ?? [])];

  return function observedRequest(...args: Parameters<RequestFn>) {
    const { method, host, path } = parseRequestArgs(args);

    if (shouldSkip(host, skipHosts)) {
      return originalFn(...args);
    }

    const correlationId = options?.getCorrelationId?.() ?? getCurrentCorrelationId();
    const nodeId = stableNodeId('http', `${method}:${host}`);
    const startedAt = Date.now();

    sdk.emit({
      type: HTTP_EVENTS.REQUEST_STARTED,
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      correlationId,
      severity: 'DEBUG',
      payload: { method, host, path, protocol },
    });

    const req = originalFn(...args);

    req.on('response', (res: http.IncomingMessage) => {
      const duration = Date.now() - startedAt;
      const statusCode = res.statusCode ?? 0;
      const failed = statusCode >= 500;
      sdk.emit({
        type: failed ? HTTP_EVENTS.REQUEST_FAILED : HTTP_EVENTS.REQUEST_COMPLETED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity: failed ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'DEBUG',
        payload: { method, host, path, protocol, statusCode, duration, durationMs: duration },
      });
    });

    req.on('error', (err: Error) => {
      const duration = Date.now() - startedAt;
      sdk.emit({
        type: HTTP_EVENTS.REQUEST_FAILED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity: 'ERROR',
        payload: {
          method, host, path, protocol, duration, durationMs: duration,
          errorName: err.name, errorMessage: err.message,
        },
      });
    });

    return req;
  } as RequestFn;
}

export function patchHttp(sdk: ObserverSDK, options?: HttpPluginOptions): () => void {
  const origHttp = http.request.bind(http) as RequestFn;
  const origHttps = https.request.bind(https) as RequestFn;

  (http as unknown as Record<string, unknown>)['request'] = wrapRequest(origHttp, 'http', sdk, options);
  (https as unknown as Record<string, unknown>)['request'] = wrapRequest(origHttps, 'https', sdk, options);

  return () => {
    (http as unknown as Record<string, unknown>)['request'] = origHttp;
    (https as unknown as Record<string, unknown>)['request'] = origHttps;
  };
}
