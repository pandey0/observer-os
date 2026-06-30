import { randomBytes, createHash } from 'crypto';
import { asNodeId, asEventId, asRelationshipId, asSessionId, asWorkspaceId } from '../types/ids.js';
import type { NodeId, EventId, RelationshipId, SessionId, WorkspaceId } from '../types/ids.js';

function short(): string {
  return randomBytes(6).toString('hex');
}

export function newNodeId(typeHint = 'node'): NodeId {
  return asNodeId(`${typeHint}_${short()}`);
}

export function newEventId(): EventId {
  return asEventId(`evt_${short()}`);
}

export function newRelationshipId(): RelationshipId {
  return asRelationshipId(`rel_${short()}`);
}

export function newSessionId(): SessionId {
  return asSessionId(`ses_${short()}`);
}

export function newWorkspaceId(): WorkspaceId {
  return asWorkspaceId(`ws_${short()}`);
}

// Deterministic ID for stable node identity across reconnects
export function stableNodeId(namespace: string, stableKey: string): NodeId {
  const hash = createHash('sha256')
    .update(`${namespace}:${stableKey}`)
    .digest('hex')
    .slice(0, 12);
  return asNodeId(`${namespace.replace(/[^a-z0-9]/gi, '_')}_${hash}`);
}
