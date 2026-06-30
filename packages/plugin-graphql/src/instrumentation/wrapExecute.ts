import { stableNodeId, getCurrentCorrelationId } from '@observer-os/sdk';
import type { ObserverSDK } from '@observer-os/sdk';
import { GRAPHQL_EVENTS } from '../node-types.js';

export interface GraphQLPluginOptions {
  getCorrelationId?: () => string | undefined;
}

interface GraphQLExecuteArgs {
  schema: unknown;
  document: unknown;
  rootValue?: unknown;
  contextValue?: unknown;
  variableValues?: Record<string, unknown> | null;
  operationName?: string | null;
}

interface GraphQLResult {
  data?: unknown;
  errors?: ReadonlyArray<{ message: string }>;
}

export type ExecuteFn = (args: GraphQLExecuteArgs) => Promise<GraphQLResult>;

function extractOperationName(document: unknown): string | null {
  try {
    const doc = document as { definitions?: Array<{ kind?: string; name?: { value?: string } }> };
    const op = doc?.definitions?.find(d => d.kind === 'OperationDefinition');
    return op?.name?.value ?? null;
  } catch { return null; }
}

function extractOperationType(document: unknown): string {
  try {
    const doc = document as { definitions?: Array<{ kind?: string; operation?: string }> };
    const op = doc?.definitions?.find(d => d.kind === 'OperationDefinition');
    return op?.operation ?? 'unknown';
  } catch { return 'unknown'; }
}

export function wrapExecute(
  originalExecute: ExecuteFn,
  sdk: ObserverSDK,
  options?: GraphQLPluginOptions,
): ExecuteFn {
  return async function observedExecute(args: GraphQLExecuteArgs): Promise<GraphQLResult> {
    const correlationId = options?.getCorrelationId?.() ?? getCurrentCorrelationId();
    const opName = args.operationName ?? extractOperationName(args.document);
    const opType = extractOperationType(args.document);
    const nodeId = stableNodeId('graphql', `${opType}:${opName ?? 'anonymous'}`);
    const startedAt = Date.now();

    sdk.emit({
      type: GRAPHQL_EVENTS.OPERATION_STARTED,
      sourceNodeId: nodeId,
      occurredAt: startedAt,
      correlationId,
      severity: 'DEBUG',
      payload: { operationName: opName, operationType: opType },
    });

    try {
      const result = await originalExecute(args);
      const duration = Date.now() - startedAt;
      const hasErrors = result.errors && result.errors.length > 0;

      sdk.emit({
        type: hasErrors ? GRAPHQL_EVENTS.OPERATION_FAILED : GRAPHQL_EVENTS.OPERATION_COMPLETED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity: hasErrors ? 'ERROR' : 'DEBUG',
        payload: {
          operationName: opName,
          operationType: opType,
          duration,
          durationMs: duration,
          errorCount: result.errors?.length ?? 0,
          errors: result.errors?.map(e => e.message).slice(0, 5) ?? [],
        },
      });
      return result;
    } catch (err) {
      const duration = Date.now() - startedAt;
      sdk.emit({
        type: GRAPHQL_EVENTS.OPERATION_FAILED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        correlationId,
        severity: 'ERROR',
        payload: {
          operationName: opName,
          operationType: opType,
          duration,
          durationMs: duration,
          errorName: err instanceof Error ? err.name : 'Unknown',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  };
}
