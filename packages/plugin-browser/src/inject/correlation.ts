// Lightweight trace ID generation — no crypto API required in all browsers

let counter = 0;

export function generateTraceId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  const seq = (++counter).toString(36).padStart(3, '0');
  return `obs-${ts}-${rnd}-${seq}`;
}

export function generateNodeId(domain: string, stableKey: string): string {
  // Browser-side stable node ID — mirrors stableNodeId() in core but without crypto
  const hash = simpleHash(`${domain}:${stableKey}`);
  return `${domain.replace(/[^a-z0-9]/gi, '_')}_${hash}`;
}

function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

export const TRACE_HEADER = 'X-Observer-Trace-Id';

// ─── W3C TraceContext ID generation (browser-side) ────────────────────────────

/**
 * Generate a W3C-compliant 128-bit trace ID as 32 lower-case hex chars.
 * Uses crypto.getRandomValues when available, falls back to Math.random.
 */
export function generateW3CTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for environments where crypto is unavailable
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * Generate a W3C-compliant 64-bit span ID as 16 lower-case hex chars.
 * Uses crypto.getRandomValues when available, falls back to Math.random.
 */
export function generateW3CSpanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** W3C traceparent header name */
export const TRACEPARENT_HEADER = 'traceparent';
