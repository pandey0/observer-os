import { randomBytes } from 'node:crypto';

/**
 * Parsed representation of a W3C traceparent header (or legacy x-observer-trace-id fallback).
 * correlationId is always equal to traceId so the rest of the SDK can use it unchanged.
 */
export interface ParsedTrace {
  /** 32 lower-case hex chars — W3C trace-id */
  traceId: string;
  /** 16 lower-case hex chars — W3C parent-id (span that sent the request) */
  parentId: string;
  /** Trace flags byte: 0x01 = sampled */
  flags: number;
  /** Alias of traceId — passed as correlationId through Observer OS events */
  correlationId: string;
}

// Matches exactly: version=00, 32-hex traceId, 16-hex parentId, 2-hex flags
const TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export const TraceContext = {
  /**
   * Extract trace context from incoming request headers.
   *
   * Priority:
   *   1. W3C `traceparent` header
   *   2. Legacy `x-observer-trace-id` header (backward compat)
   *
   * Returns null when neither header is present or when traceparent is malformed.
   */
  extract(headers: Record<string, string | string[] | undefined>): ParsedTrace | null {
    const traceparent = getHeader(headers, 'traceparent');
    if (traceparent) {
      const match = TRACEPARENT_REGEX.exec(traceparent);
      if (match) {
        const traceId = match[1]!.toLowerCase();
        const parentId = match[2]!.toLowerCase();
        const flags = parseInt(match[3]!, 16);
        return { traceId, parentId, flags, correlationId: traceId };
      }
      // Malformed traceparent — don't fall through to x-observer-trace-id
      return null;
    }

    const legacyId = getHeader(headers, 'x-observer-trace-id');
    if (legacyId) {
      return {
        traceId: legacyId,
        parentId: '0000000000000000',
        flags: 1,
        correlationId: legacyId,
      };
    }

    return null;
  },

  /**
   * Inject W3C traceparent AND the legacy x-observer-trace-id header into an outgoing
   * headers map.  Both are written so that older Observer plugins without W3C support
   * still see a correlationId.
   */
  inject(headers: Record<string, string>, traceId: string, spanId: string): void {
    headers['traceparent'] = `00-${traceId}-${spanId}-01`;
    headers['x-observer-trace-id'] = traceId;
  },

  /** Generate a W3C-compliant 128-bit trace ID (32 lower-case hex chars). */
  generateTraceId(): string {
    return randomBytes(16).toString('hex');
  },

  /** Generate a W3C-compliant 64-bit span ID (16 lower-case hex chars). */
  generateSpanId(): string {
    return randomBytes(8).toString('hex');
  },
} as const;
