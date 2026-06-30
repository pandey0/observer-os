import type { NodeId, RelationshipId, SessionId, WorkspaceId, DomainId } from './ids.js';

export type NodeStatus =
  | 'DISCOVERED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'FAILED'
  | 'DESTROYED'
  | 'ARCHIVED';

export type CapabilityType =
  | 'WATCH'
  | 'SNAPSHOT'
  | 'DIFF'
  | 'EXPAND'
  | 'INSPECT'
  | 'REPLAY'
  | 'TIMELINE'
  | 'SEARCH'
  | 'RECORD';

export type Visibility = 'LOCAL' | 'SESSION' | 'WORKSPACE';

export type RelationshipType =
  | 'TRIGGERED'
  | 'CALLED'
  | 'RETURNED'
  | 'FAILED'
  | 'UPDATED'
  | 'RENDERED'
  | 'CREATED'
  | 'DESTROYED'
  | 'DEPENDS_ON'
  | 'USES'
  | 'OBSERVES'
  | 'PRODUCED'
  | 'CONSUMED'
  | 'CORRELATED_WITH'
  | 'EXPLAINS';

export interface Relationship {
  readonly id: RelationshipId;
  readonly type: RelationshipType;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly recordedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RuntimeNode {
  readonly id: NodeId;
  readonly type: string;             // namespaced: "observer.browser/HttpRequest"
  readonly domain: DomainId;
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly status: NodeStatus;
  readonly createdAt: number;        // ms since epoch
  readonly updatedAt: number;
  readonly completedAt?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly capabilities: readonly CapabilityType[];
  readonly relationships: readonly Relationship[];
  readonly version: number;          // mutation counter
  readonly visibility: Visibility;
}

export interface NodeTypeRegistration {
  readonly type: string;
  readonly displayName: string;
  readonly description: string;
  readonly schemaVersion: string;
  readonly capabilities: readonly CapabilityType[];
  readonly domainId: DomainId;
}
