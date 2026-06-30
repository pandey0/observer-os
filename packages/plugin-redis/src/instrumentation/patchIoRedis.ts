import type { ObserverSDK } from '@observer-os/sdk';
import { getCurrentCorrelationId } from '@observer-os/sdk';
import { asNodeId } from '@observer-os/core';
import { REDIS_EVENTS } from '../node-types.js';
import { wrapPipelineExec } from './patchPipeline.js';

let cmdSeq = 0;

function nodeId(prefix: string, n: number) {
  return asNodeId(`${prefix}_${n}`);
}

/**
 * Patch an ioredis client instance to emit Observer events.
 *
 * Instruments:
 *   - client.sendCommand(command) for single commands
 *   - client.pipeline() — wraps the returned pipeline's exec()
 *   - client.multi()    — same treatment as pipeline()
 *
 * Returns an unpatch function.
 */
export function patchIoRedis(
  client: unknown,
  sdk: ObserverSDK,
  getCorrelationId?: () => string | undefined,
): () => void {
  const c = client as Record<string, unknown>;
  const unpatchers: Array<() => void> = [];

  // ── sendCommand ──────────────────────────────────────────────────────────────
  const originalSendCommand = (c['sendCommand'] as (...args: unknown[]) => Promise<unknown>).bind(client);

  c['sendCommand'] = async function observedSendCommand(command: unknown): Promise<unknown> {
    const cmd = command as Record<string, unknown>;
    const commandName = String(cmd['name'] ?? 'UNKNOWN').toUpperCase();
    const args = (cmd['args'] ?? []) as unknown[];
    const keyArg =
      args.length > 0
        ? String(args[0] ?? '').slice(0, 200)
        : null;

    const cmdId = nodeId('redis_cmd', ++cmdSeq);
    const corrId = getCorrelationId?.() ?? getCurrentCorrelationId();

    sdk.emit({
      type: REDIS_EVENTS.COMMAND_STARTED,
      sourceNodeId: cmdId,
      occurredAt: Date.now(),
      payload: {
        commandName,
        keyArg,
        argCount: args.length,
      },
      correlationId: corrId,
      severity: 'DEBUG',
    });

    const t0 = Date.now();
    try {
      const result = await originalSendCommand(command);
      const durationMs = Date.now() - t0;
      sdk.emit({
        type: REDIS_EVENTS.COMMAND_COMPLETED,
        sourceNodeId: cmdId,
        occurredAt: Date.now(),
        payload: {
          commandName,
          keyArg,
          argCount: args.length,
          duration: durationMs,
          durationMs,
          resultType: typeof result,
        },
        correlationId: corrId,
        severity: 'DEBUG',
      });
      return result;
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      const durationMs = Date.now() - t0;
      sdk.emit({
        type: REDIS_EVENTS.COMMAND_FAILED,
        sourceNodeId: cmdId,
        occurredAt: Date.now(),
        payload: {
          commandName,
          keyArg,
          argCount: args.length,
          duration: durationMs,
          durationMs,
          errorName: e.name,
          errorMessage: e.message,
        },
        correlationId: corrId,
        severity: 'ERROR',
      });
      throw err;
    }
  };

  unpatchers.push(() => {
    c['sendCommand'] = originalSendCommand;
  });

  // ── pipeline() ───────────────────────────────────────────────────────────────
  if (typeof c['pipeline'] === 'function') {
    const originalPipeline = (c['pipeline'] as (...args: unknown[]) => unknown).bind(client);

    c['pipeline'] = function (...args: unknown[]): unknown {
      const pipe = originalPipeline(...args) as Record<string, unknown>;
      wrapPipelineExec(
        pipe,
        sdk,
        () => {
          // ioredis stores queued commands in _queue
          const queue = (pipe['_queue'] ?? []) as Array<Record<string, unknown>>;
          return {
            commandCount: queue.length,
            commandNames: queue.map((cmd) => String(cmd['name'] ?? 'UNKNOWN').toUpperCase()),
          };
        },
        getCorrelationId,
      );
      return pipe;
    };

    unpatchers.push(() => {
      c['pipeline'] = originalPipeline;
    });
  }

  // ── multi() ──────────────────────────────────────────────────────────────────
  if (typeof c['multi'] === 'function') {
    const originalMulti = (c['multi'] as (...args: unknown[]) => unknown).bind(client);

    c['multi'] = function (...args: unknown[]): unknown {
      const multi = originalMulti(...args) as Record<string, unknown>;
      wrapPipelineExec(
        multi,
        sdk,
        () => {
          const queue = (multi['_queue'] ?? []) as Array<Record<string, unknown>>;
          return {
            commandCount: queue.length,
            commandNames: queue.map((cmd) => String(cmd['name'] ?? 'UNKNOWN').toUpperCase()),
          };
        },
        getCorrelationId,
      );
      return multi;
    };

    unpatchers.push(() => {
      c['multi'] = originalMulti;
    });
  }

  return () => {
    for (const fn of unpatchers) fn();
  };
}
