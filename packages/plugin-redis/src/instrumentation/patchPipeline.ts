import type { ObserverSDK } from '@observer-os/sdk';
import { getCurrentCorrelationId } from '@observer-os/sdk';
import { asNodeId } from '@observer-os/core';
import { REDIS_EVENTS } from '../node-types.js';

let pipelineSeq = 0;

function nodeId(prefix: string, n: number) {
  return asNodeId(`${prefix}_${n}`);
}

/**
 * Wrap the `.exec()` method of a pipeline / multi object with Observer events.
 * Returns an unpatch function.
 *
 * @param pipeline    The pipeline or multi object (cast to Record for assignment).
 * @param sdk         ObserverSDK instance.
 * @param getCommandInfo  Returns { commandCount, commandNames } at call time.
 * @param getCorrelationId  Optional per-request correlationId getter.
 */
export function wrapPipelineExec(
  pipeline: Record<string, unknown>,
  sdk: ObserverSDK,
  getCommandInfo: () => { commandCount: number; commandNames: string[] },
  getCorrelationId?: () => string | undefined,
): () => void {
  const originalExec = (pipeline['exec'] as (...args: unknown[]) => Promise<unknown>).bind(pipeline);

  pipeline['exec'] = async function (...args: unknown[]): Promise<unknown> {
    const { commandCount, commandNames } = getCommandInfo();
    const pipeId = nodeId('redis_pipe', ++pipelineSeq);
    const corrId = getCorrelationId?.() ?? getCurrentCorrelationId();

    sdk.emit({
      type: REDIS_EVENTS.PIPELINE_STARTED,
      sourceNodeId: pipeId,
      occurredAt: Date.now(),
      payload: {
        commandCount,
        commandNames,
      },
      correlationId: corrId,
      severity: 'DEBUG',
    });

    const t0 = Date.now();
    try {
      const results = await originalExec(...args);

      // Count per-command errors in results (ioredis: [error, value][] ; node-redis: value[])
      let errorCount = 0;
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r instanceof Error) {
            errorCount++;
          } else if (Array.isArray(r) && r[0] instanceof Error) {
            errorCount++;
          }
        }
      }

      const durationMs = Date.now() - t0;
      sdk.emit({
        type: REDIS_EVENTS.PIPELINE_COMPLETED,
        sourceNodeId: pipeId,
        occurredAt: Date.now(),
        payload: {
          commandCount,
          duration: durationMs,
          durationMs,
          errorCount,
        },
        correlationId: corrId,
        severity: errorCount > 0 ? 'WARN' : 'DEBUG',
      });

      return results;
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      const durationMs = Date.now() - t0;
      sdk.emit({
        type: REDIS_EVENTS.PIPELINE_FAILED,
        sourceNodeId: pipeId,
        occurredAt: Date.now(),
        payload: {
          commandCount,
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

  return () => {
    pipeline['exec'] = originalExec;
  };
}
