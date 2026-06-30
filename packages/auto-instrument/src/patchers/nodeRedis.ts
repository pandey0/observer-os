import { tryRequire } from '../detect';
import type { EventQueue } from '../queue';

let seq = 0;

interface NodeRedisClient {
  sendCommand: (...args: unknown[]) => Promise<unknown>;
}

export function patchNodeRedis(queue: EventQueue): boolean {
  // node-redis v4+ exports createClient; we patch the prototype via the module
  const redisModule = tryRequire('redis') as {
    createClient?: (...args: unknown[]) => NodeRedisClient;
    RedisClient?: { prototype: NodeRedisClient };
  } | null;
  if (!redisModule) return false;

  // node-redis v4: patch via RedisClient prototype if available
  const proto = (redisModule as { RedisClient?: { prototype: NodeRedisClient } }).RedisClient?.prototype;
  if (!proto) return false;

  const origSend = proto.sendCommand;
  if (!origSend) return false;

  proto.sendCommand = function observerNodeRedisSend(...args: unknown[]) {
    const cmdArgs = args[0] as string[] | null;
    const cmdName = Array.isArray(cmdArgs) && cmdArgs.length > 0 ? cmdArgs[0] : 'unknown';
    const nodeId = `redis:node-redis:${++seq}`;
    const startedAt = Date.now();

    queue.push({
      type: 'observer.redis/command.started',
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      severity: 'DEBUG',
      payload: { command: cmdName },
    });

    const result = origSend.apply(this as object, args) as Promise<unknown>;
    if (result && typeof result.then === 'function') {
      return result
        .then((r: unknown) => {
          const duration = Date.now() - startedAt;
          queue.push({
            type: 'observer.redis/command.completed',
            sourceNodeId: nodeId,
            occurredAt: Date.now(),
            severity: 'DEBUG',
            payload: { command: cmdName, duration, durationMs: duration },
          });
          return r;
        })
        .catch((err: Error) => {
          queue.push({
            type: 'observer.redis/command.failed',
            sourceNodeId: nodeId,
            occurredAt: Date.now(),
            severity: 'ERROR',
            payload: { command: cmdName, errorMessage: err.message, duration: Date.now() - startedAt },
          });
          throw err;
        });
    }
    return result;
  };

  return true;
}
