import type { Session, RuntimeEvent, RuntimeNode } from '@observer-os/core';

// ─── REST request bodies ──────────────────────────────────────────────────────

export interface CreateSessionBody {
  name?: string;
  tags?: string[];
}

export interface EmitEventBody {
  type: string;
  sourceNodeId: string;
  affectedNodeIds?: string[];
  occurredAt: number;
  payload: Record<string, unknown>;
  causedByEventId?: string;
  correlationId?: string;
  severity?: string;
  schemaVersion?: string;
}

// ─── REST response shapes ─────────────────────────────────────────────────────

export interface ApiSession {
  id: string;
  name: string;
  workspaceId: string;
  status: Session['status'];
  startedAt: number;
  endedAt?: number;
  pausedAt?: number;
  tags: readonly string[];
  eventCount: number;
  nodeCount: number;
}

export function toApiSession(s: Session): ApiSession {
  return {
    id: s.id as string,
    name: s.name,
    workspaceId: s.workspaceId as string,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    pausedAt: s.pausedAt,
    tags: s.tags,
    eventCount: s.eventCount,
    nodeCount: s.nodeCount,
  };
}

export interface EventsResponse {
  sessionId: string;
  total: number;
  events: RuntimeEvent[];
}

export interface NodesResponse {
  sessionId: string;
  total: number;
  nodes: RuntimeNode[];
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
  sessions: number;
  activeSessions?: number;
  totalEvents?: number;
  memoryMb?: number;
}

// ─── WebSocket message protocol ───────────────────────────────────────────────

export type StreamMessage =
  | { type: 'snapshot'; events: RuntimeEvent[]; nodes: RuntimeNode[] }
  | { type: 'event'; data: RuntimeEvent }
  | { type: 'node'; data: RuntimeNode }
  | { type: 'session_ended'; sessionId: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe'; afterSequence?: number };

export interface Annotation {
  id: string;
  sessionId: string;
  nodeId?: string;
  eventId?: string;
  text: string;
  author?: string;
  createdAt: number;
}
