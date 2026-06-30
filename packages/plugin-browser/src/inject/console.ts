import { emit } from './emitter.js';
import { generateNodeId } from './correlation.js';
import { BROWSER_EVENTS } from './event-types.js';

type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug' | 'group' | 'groupEnd';

const LEVEL_MAP: Record<ConsoleLevel, string> = {
  log:      BROWSER_EVENTS.CONSOLE_LOG,
  warn:     BROWSER_EVENTS.CONSOLE_WARN,
  error:    BROWSER_EVENTS.CONSOLE_ERROR,
  info:     BROWSER_EVENTS.CONSOLE_INFO,
  debug:    BROWSER_EVENTS.CONSOLE_DEBUG,
  group:    BROWSER_EVENTS.CONSOLE_GROUP,
  groupEnd: BROWSER_EVENTS.CONSOLE_GROUP,
};

const SEVERITY_MAP: Partial<Record<ConsoleLevel, 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'>> = {
  log:   'INFO',
  warn:  'WARN',
  error: 'ERROR',
  info:  'INFO',
  debug: 'DEBUG',
};

// Stable node per console level: one ConsoleMessage node per level, not per message
const LEVEL_NODES: Record<string, string> = {};

export function patchConsole(): void {
  if (typeof console === 'undefined') return;

  const levels: ConsoleLevel[] = ['log', 'warn', 'error', 'info', 'debug', 'group'];

  for (const level of levels) {
    const original = console[level].bind(console);
    LEVEL_NODES[level] = generateNodeId('browser', `console:${level}`);

    console[level] = function observerConsole(...args: unknown[]): void {
      original(...args);

      emit({
        type: LEVEL_MAP[level],
        sourceNodeId: LEVEL_NODES[level]!,
        occurredAt: Date.now(),
        severity: SEVERITY_MAP[level] ?? 'INFO',
        payload: {
          level,
          args: args.map(serializeArg),
          stack: level === 'error' ? captureStack() : undefined,
        },
      });
    };
  }
}

function serializeArg(arg: unknown): unknown {
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;
  if (arg instanceof Error) return { name: arg.name, message: arg.message, stack: arg.stack };
  try {
    return JSON.parse(JSON.stringify(arg)); // deep clone, strip non-serializable
  } catch {
    return String(arg);
  }
}

function captureStack(): string | undefined {
  try {
    return new Error().stack?.split('\n').slice(3, 8).join('\n');
  } catch {
    return undefined;
  }
}
