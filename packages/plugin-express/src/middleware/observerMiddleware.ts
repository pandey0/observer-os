import type { IncomingHttpHeaders } from 'http';
import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import type { ObserverSDK } from '@observer-os/sdk';
import { runWithCorrelation, TraceContext } from '@observer-os/sdk';
import { EXPRESS_EVENTS } from '../node-types.js';

const REDACTED = '[REDACTED]';
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'proxy-authorization',
]);

export function createRequestMiddleware(sdk: ObserverSDK): RequestHandler {
  let reqSeq = 0;

  return function observerRequestMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!sdk.isConnected()) {
      next();
      return;
    }

    // Extract W3C traceparent (or fall back to x-observer-trace-id)
    const parsed = TraceContext.extract(req.headers as Record<string, string | string[] | undefined>);
    const correlationId = parsed?.correlationId;

    // Unique-per-request node — counter is stable within a session (resets on reconnect)
    const nodeId = sdk.generateNodeId(`request:${++reqSeq}`);
    const startedAt = Date.now();

    sdk.emit({
      type: EXPRESS_EVENTS.REQUEST_STARTED,
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      correlationId,
      payload: {
        method:  req.method,
        path:    req.path,
        url:     req.url,
        headers: sanitizeHeaders(req.headers),
        query:   req.query as Record<string, unknown>,
        ip:      req.ip ?? null,
        traceId:  parsed?.traceId ?? null,
        parentId: parsed?.parentId ?? null,
      },
    });

    res.on('finish', () => {
      const duration = Date.now() - startedAt;
      const status   = res.statusCode;
      const failed   = status >= 500;
      const severity = failed ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
      const routePath = (req.route?.path as string | undefined) ?? req.path;

      sdk.emit({
        type: failed ? EXPRESS_EVENTS.REQUEST_FAILED : EXPRESS_EVENTS.REQUEST_COMPLETED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity,
        payload: {
          method:      req.method,
          path:        req.path,
          route:       routePath,
          statusCode:  status,
          duration,
          contentType: (res.getHeader('content-type') as string | undefined) ?? null,
        },
      });
    });

    res.on('error', (err: Error) => {
      sdk.emit({
        type: EXPRESS_EVENTS.REQUEST_FAILED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity: 'ERROR',
        payload: {
          method:  req.method,
          path:    req.path,
          error:   err.message,
          duration: Date.now() - startedAt,
        },
      });
    });

    // Wrap next() in propagation context so downstream plugins (postgres, redis, etc.)
    // can read correlationId via getCurrentCorrelationId() without manual plumbing.
    // Fall back to the generated node ID when no trace header is present.
    runWithCorrelation(correlationId ?? nodeId.toString(), next);
  };
}

export function createErrorMiddleware(sdk: ObserverSDK): ErrorRequestHandler {
  return function observerErrorMiddleware(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (sdk.isConnected()) {
      const parsedErr = TraceContext.extract(req.headers as Record<string, string | string[] | undefined>);
      sdk.emit({
        type: EXPRESS_EVENTS.ERROR_CAUGHT,
        sourceNodeId: sdk.generateNodeId('error-handler'),
        occurredAt: Date.now(),
        correlationId: parsedErr?.correlationId,
        severity: 'ERROR',
        payload: {
          method:  req.method,
          path:    req.path,
          name:    err.name,
          message: err.message,
          stack:   err.stack ?? null,
        },
      });
    }
    next(err);
  };
}

function sanitizeHeaders(headers: IncomingHttpHeaders): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.has(key) ? REDACTED : value;
  }
  return out;
}
