import type { EventQueue } from '../queue';
import { correlationStorage } from '../context';

const METHODS = ['log', 'warn', 'error', 'debug', 'info'] as const;

function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ')
    .slice(0, 2000);
}

const SEVERITY: Record<string, string> = {
  log: 'INFO', info: 'INFO', debug: 'DEBUG', warn: 'WARN', error: 'ERROR',
};

export function patchConsole(queue: EventQueue): boolean {
  try {
    const originals: Record<string, (...a: unknown[]) => void> = {};
    for (const method of METHODS) {
      originals[method] = console[method].bind(console) as (...a: unknown[]) => void;
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      console[method] = (...args: unknown[]) => {
        // Always call original first so developer still sees output
        (originals[method] as (...a: unknown[]) => void)(...args);
        const message = serialize(args);
        // Skip Observer's own internal messages to avoid noise
        if (message.startsWith('[Observer OS]')) return;
        const correlationId = correlationStorage.getStore();
        queue.push({
          type: `observer.console/${method}`,
          sourceNodeId: 'console',
          correlationId,
          occurredAt: Date.now(),
          severity: (SEVERITY[method] ?? 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
          payload: { method, message, args: args.slice(0, 5) },
        });
      };
    }
    return true;
  } catch {
    return false;
  }
}
