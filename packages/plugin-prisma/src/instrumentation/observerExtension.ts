import { stableNodeId, getCurrentCorrelationId } from '@observer-os/sdk';
import type { ObserverSDK } from '@observer-os/sdk';
import { PRISMA_EVENTS } from '../node-types.js';

export interface PrismaPluginOptions {
  getCorrelationId?: () => string | undefined;
}

export interface AllOperationsArgs {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

export function createObserverExtension(sdk: ObserverSDK, options?: PrismaPluginOptions) {
  return {
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: AllOperationsArgs) {
          const correlationId = options?.getCorrelationId?.() ?? getCurrentCorrelationId();
          const nodeId = stableNodeId('prisma', `${model}.${operation}`);
          const startedAt = Date.now();

          sdk.emit({
            type: PRISMA_EVENTS.QUERY_STARTED,
            sourceNodeId: nodeId,
            occurredAt: startedAt,
            correlationId,
            severity: 'DEBUG',
            payload: {
              model,
              operation,
              argKeys: Object.keys(args as Record<string, unknown>),
            },
          });

          try {
            const result = await query(args);
            const duration = Date.now() - startedAt;
            sdk.emit({
              type: PRISMA_EVENTS.QUERY_COMPLETED,
              sourceNodeId: nodeId,
              occurredAt: Date.now(),
              correlationId,
              severity: 'DEBUG',
              payload: {
                model,
                operation,
                duration,
                durationMs: duration,
                resultCount: Array.isArray(result) ? result.length : result !== null ? 1 : 0,
              },
            });
            return result;
          } catch (err) {
            const duration = Date.now() - startedAt;
            sdk.emit({
              type: PRISMA_EVENTS.QUERY_FAILED,
              sourceNodeId: nodeId,
              occurredAt: Date.now(),
              correlationId,
              severity: 'ERROR',
              payload: {
                model,
                operation,
                duration,
                durationMs: duration,
                errorName: err instanceof Error ? err.name : 'Unknown',
                errorMessage: err instanceof Error ? err.message : String(err),
              },
            });
            throw err;
          }
        },
      },
    },
  };
}
