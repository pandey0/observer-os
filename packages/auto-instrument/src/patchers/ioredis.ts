import { tryRequire } from '../detect';
import type { EventQueue } from '../queue';
import { correlationStorage } from '../context';

// Track which client instances already have an infrastructure node emitted
const registeredClients = new WeakSet<object>();

export function patchIoRedis(queue: EventQueue): boolean {
  const Redis = tryRequire('ioredis') as {
    prototype?: {
      sendCommand: (...a: unknown[]) => unknown;
      options?: { host?: string; port?: number };
    };
  } | null;
  if (!Redis?.prototype) return false;

  const proto = Redis.prototype as {
    sendCommand: (...a: unknown[]) => unknown;
    options?: { host?: string; port?: number };
  };
  const origSend = proto.sendCommand;

  proto.sendCommand = function observerSend(this: typeof proto, ...args: unknown[]) {
    const host = this.options?.host ?? 'localhost';
    const port = this.options?.port ?? 6379;
    const clientNodeId = `redis:client:${host}:${port}`;

    // Emit infrastructure node once per client instance
    if (!registeredClients.has(this as object)) {
      registeredClients.add(this as object);
      queue.push({
        type: 'observer.redis/client.connected',
        sourceNodeId: clientNodeId,
        occurredAt: Date.now(),
        severity: 'INFO',
        payload: { host, port },
      });
    }

    const cmd = args[0] as { name?: string } | null;
    const cmdName = cmd?.name ?? 'unknown';
    const correlationId = correlationStorage.getStore();
    const startedAt = Date.now();

    queue.push({
      type: 'observer.redis/command.started',
      sourceNodeId: clientNodeId,
      correlationId,
      occurredAt: startedAt,
      severity: 'DEBUG',
      payload: { command: cmdName },
    });

    const result = origSend.apply(this as object, args) as Promise<unknown>;
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>)
        .then((r) => {
          queue.push({
            type: 'observer.redis/command.completed',
            sourceNodeId: clientNodeId,
            correlationId,
            occurredAt: Date.now(),
            severity: 'DEBUG',
            payload: { command: cmdName, durationMs: Date.now() - startedAt },
          });
          return r;
        })
        .catch((err: Error) => {
          queue.push({
            type: 'observer.redis/command.failed',
            sourceNodeId: clientNodeId,
            correlationId,
            occurredAt: Date.now(),
            severity: 'ERROR',
            payload: { command: cmdName, errorMessage: err.message, durationMs: Date.now() - startedAt },
          });
          throw err;
        });
    }
    return result;
  };

  return true;
}
