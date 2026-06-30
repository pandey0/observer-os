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
 * Patch a node-redis v4+ client instance to emit Observer events.
 *
 * Instruments:
 *   - client.sendCommand(args: unknown[]) — args[0] is the command name
 *   - client.multi() — wraps the returned multi object's exec()
 *
 * Returns an unpatch function.
 */
export function patchNodeRedis(
  client: unknown,
  sdk: ObserverSDK,
  getCorrelationId?: () => string | undefined,
): () => void {
  const c = client as Record<string, unknown>;
  const unpatchers: Array<() => void> = [];

  // ── sendCommand ──────────────────────────────────────────────────────────────
  const originalSendCommand = (c['sendCommand'] as (...args: unknown[]) => Promise<unknown>).bind(client);

  c['sendCommand'] = async function observedSendCommand(args: unknown[]): Promise<unknown> {
    const commandName = String(args[0] ?? 'UNKNOWN').toUpperCase();
    const keyArg =
      args.length > 1
        ? String(args[1] ?? '').slice(0, 200)
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
      const result = await originalSendCommand(args);
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

  // ── multi() ──────────────────────────────────────────────────────────────────
  if (typeof c['multi'] === 'function') {
    const originalMulti = (c['multi'] as (...args: unknown[]) => unknown).bind(client);

    c['multi'] = function (...args: unknown[]): unknown {
      const multi = originalMulti(...args) as Record<string, unknown>;

      // node-redis stores queued commands in _queue (array of string arrays)
      wrapPipelineExec(
        multi,
        sdk,
        () => {
          const queue = (multi['_queue'] ?? []) as Array<unknown[]>;
          return {
            commandCount: queue.length,
            commandNames: queue.map((cmd) => String((cmd as unknown[])[0] ?? 'UNKNOWN').toUpperCase()),
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
