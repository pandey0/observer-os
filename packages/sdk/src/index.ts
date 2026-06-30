// ─── Types (plugin authors use these) ────────────────────────────────────────
export * from './types/index.js';

// ─── Runtime (Observer OS uses these) ────────────────────────────────────────
export { PluginSDKImpl } from './sdk/PluginSDKImpl.js';
export type { LogHandler } from './sdk/PluginSDKImpl.js';

export { PluginRegistry } from './registry/PluginRegistry.js';
export type { PluginEntry, PluginStatus, PluginLogSubscriber } from './registry/PluginRegistry.js';

export { UpcasterRegistry } from './upcaster/UpcasterRegistry.js';
export type { UpcasterFn } from './upcaster/UpcasterRegistry.js';

// ─── Re-export core types plugin authors need ─────────────────────────────────
export type {
  NodeId,
  EventId,
  SessionId,
  WorkspaceId,
  DomainId,
  RuntimeEvent,
  EmitInput,
  Severity,
  NodeTypeRegistration,
  CapabilityType,
  RelationshipType,
} from '@observer-os/core';

export { newNodeId, stableNodeId, asNodeId, asWorkspaceId } from '@observer-os/core';

// ─── Propagation context (AsyncLocalStorage-based auto-correlation) ───────────
export {
  runWithCorrelation,
  getCurrentCorrelationId,
  getCurrentSessionId,
  hasPropagationContext,
} from './propagation.js';

// ─── W3C TraceContext — distributed tracing ───────────────────────────────────
export { TraceContext } from './trace-context.js';
export type { ParsedTrace } from './trace-context.js';
