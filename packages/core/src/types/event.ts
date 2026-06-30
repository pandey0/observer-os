import type { NodeId, EventId, SessionId, WorkspaceId } from './ids.js';

export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface RuntimeEvent {
  readonly id: EventId;
  readonly type: string;             // "observer.browser/network.request.started"
  readonly sourceNodeId: NodeId;
  readonly affectedNodeIds: readonly NodeId[];
  readonly occurredAt: number;       // plugin clock (ms since epoch)
  readonly recordedAt: number;       // observer clock (ms since epoch)
  readonly sequenceNumber: number;   // global monotonic, assigned by Event Log
  readonly payload: Readonly<Record<string, unknown>>;
  readonly causedByEventId?: EventId;
  readonly correlationId?: string;
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly severity: Severity;
  readonly schemaVersion: string;
}

// Input shape when emitting an event (before platform stamps it)
export interface EmitInput {
  readonly type: string;
  readonly sourceNodeId: NodeId;
  readonly affectedNodeIds?: readonly NodeId[];
  readonly occurredAt: number;
  readonly payload: Record<string, unknown>;
  readonly causedByEventId?: EventId;
  readonly correlationId?: string;
  readonly severity?: Severity;
  readonly schemaVersion?: string;
}

export interface EventReadOptions {
  readonly afterSequence?: number;
  readonly limit?: number;
  readonly nodeId?: NodeId;
  readonly eventType?: string;
  readonly severity?: Severity;
}
