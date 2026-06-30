import type { BrowserEmitPayload, ObserverConfig } from './types.js';

let config: ObserverConfig | null = null;
const queue: BrowserEmitPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let disabled = false;

export function initEmitter(cfg: ObserverConfig): void {
  config = cfg;
  disabled = cfg.disabled ?? false;
}

export function emit(event: BrowserEmitPayload): void {
  if (disabled || !config) return;
  queue.push(event);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 16); // coalesce within one frame
}

function flush(): void {
  if (queue.length === 0 || !config) return;
  const batch = queue.splice(0, queue.length);

  const body = JSON.stringify({ sessionId: config.sessionId, events: batch });

  // sendBeacon for fire-and-forget (survives page unload)
  // Fall back to fetch if sendBeacon unavailable or body too large
  const url = `${config.bridgeUrl}/events`;

  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (!sent) fetchFlush(url, body);
    } else {
      fetchFlush(url, body);
    }
  } catch {
    // Bridge unreachable — drop silently, never crash the page
  }
}

function fetchFlush(url: string, body: string): void {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => { /* silent */ });
}

/** Force immediate flush — call before page unload. */
export function flushSync(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}
