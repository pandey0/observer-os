import type { SessionId, WorkspaceId } from './ids.js';

export type SessionStatus =
  | 'CREATING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ARCHIVED';

export interface Session {
  readonly id: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly status: SessionStatus;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly pausedAt?: number;
  readonly tags: readonly string[];
  readonly eventCount: number;
  readonly nodeCount: number;
}

export interface CreateSessionOptions {
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly workspaceId?: WorkspaceId;
}
