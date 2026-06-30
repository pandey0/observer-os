// Branded ID types — prevent accidental ID misuse across entity types
export type NodeId = string & { readonly __brand: 'NodeId' };
export type EventId = string & { readonly __brand: 'EventId' };
export type RelationshipId = string & { readonly __brand: 'RelationshipId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };
export type DomainId = string & { readonly __brand: 'DomainId' };

export function asNodeId(s: string): NodeId { return s as NodeId; }
export function asEventId(s: string): EventId { return s as EventId; }
export function asRelationshipId(s: string): RelationshipId { return s as RelationshipId; }
export function asSessionId(s: string): SessionId { return s as SessionId; }
export function asWorkspaceId(s: string): WorkspaceId { return s as WorkspaceId; }
export function asDomainId(s: string): DomainId { return s as DomainId; }
