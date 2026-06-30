// Mirror of daemon API types — browser-safe (no Node.js imports)

export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'FAILED';
export type NodeStatus = 'DISCOVERED' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'DESTROYED' | 'ARCHIVED';
export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export type RelationshipType =
  | 'TRIGGERED' | 'CALLED' | 'RETURNED' | 'FAILED' | 'UPDATED'
  | 'RENDERED' | 'CREATED' | 'DESTROYED' | 'DEPENDS_ON' | 'USES'
  | 'OBSERVES' | 'PRODUCED' | 'CONSUMED' | 'CORRELATED_WITH' | 'EXPLAINS';

export interface Relationship {
  id: string;
  type: RelationshipType;
  source: string;
  target: string;
  recordedAt: number;
  metadata?: Record<string, unknown>;
}

export interface RuntimeNode {
  id: string;
  type: string;
  domain: string;
  sessionId: string;
  workspaceId: string;
  status: NodeStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  metadata: Record<string, unknown>;
  capabilities: string[];
  relationships: Relationship[];
  version: number;
  visibility: string;
}

export interface RuntimeEvent {
  id: string;
  type: string;
  sourceNodeId: string;
  affectedNodeIds: string[];
  occurredAt: number;
  recordedAt: number;
  sequenceNumber: number;
  payload: Record<string, unknown>;
  causedByEventId?: string;
  correlationId?: string;
  sessionId: string;
  workspaceId: string;
  severity: Severity;
  schemaVersion: string;
}

export interface ApiSession {
  id: string;
  name: string;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  pausedAt?: number;
  eventCount: number;
  nodeCount: number;
  workspaceId: string;
  tags: string[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  uptime: number;
  sessions: number | { total: number; active: number };
}

export interface EventsResponse {
  events: RuntimeEvent[];
  total: number;
  sessionId: string;
}

export interface NodesResponse {
  nodes: RuntimeNode[];
  total: number;
  sessionId: string;
}

// WebSocket messages from daemon
export type WsMessage =
  | { type: 'snapshot'; events: RuntimeEvent[]; nodes: RuntimeNode[]; data?: { events: RuntimeEvent[]; nodes: RuntimeNode[] } }
  | { type: 'event'; event?: RuntimeEvent; data?: RuntimeEvent }
  | { type: 'node'; node?: RuntimeNode; data?: RuntimeNode }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string };

export type WsClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe'; eventTypes: string[] };

export interface TimingBucket {
  nodeId: string;
  eventType: string;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface PerformanceReport {
  sessionId: string;
  generatedAt: number;
  buckets: TimingBucket[];
  slowest: TimingBucket[];
}

export interface SessionSearchMatch {
  failedNodeCount: number;
  matchedTags: string[];
  topEventTypes: { type: string; count: number }[];
  topNodeDomains: { domain: string; count: number }[];
}

export interface SessionSearchResult {
  session: ApiSession;
  matches: SessionSearchMatch;
}

export interface SessionSearchResponse {
  query: Record<string, string>;
  total: number;
  results: SessionSearchResult[];
}

// Context API
export interface ContextRequest {
  anchor: { type: 'error' | 'node'; nodeId: string };
  depth?: 'SURFACE' | 'DETAILED' | 'FULL';
  format?: 'MARKDOWN' | 'JSON';
}

export interface ContextPackage {
  sessionId: string;
  anchor: { type: string; nodeId: string };
  depth: string;
  format: string;
  tokenEstimate: number;
  nodes: RuntimeNode[];
  events: RuntimeEvent[];
  causalChain: string[];
  correlatedNodes: string[];
  markdownContent: string;
  generatedAt: number;
}
