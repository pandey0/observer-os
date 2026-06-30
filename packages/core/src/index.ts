import { EventLog } from './event-log/EventLog.js';
import { ProjectionEngine } from './projection-engine/ProjectionEngine.js';
import { SessionEngine } from './session-engine/SessionEngine.js';
import { PersistenceManager } from './persistence/PersistenceManager.js';
import type { WorkspaceId } from './types/ids.js';

export interface CoreOptions {
  /** Directory for persistent event + session storage. Omit for in-memory only. */
  readonly dataDir?: string;
}

export interface ObserverCore {
  readonly sessions: SessionEngine;
  readonly events: EventLog;
  readonly graph: ProjectionEngine;
  dispose(): void;
}

/** Create and wire the Observer OS core engine. */
export function createCore(workspaceId?: WorkspaceId, options?: CoreOptions): ObserverCore {
  let pm: PersistenceManager | undefined;
  if (options?.dataDir) {
    pm = new PersistenceManager(options.dataDir);
    pm.init();
  }

  const events   = new EventLog(pm);
  const graph    = new ProjectionEngine(events);
  const sessions = new SessionEngine(events, graph, workspaceId, pm);

  return {
    sessions,
    events,
    graph,
    dispose() {
      graph.dispose();
    },
  };
}

/**
 * Load an ObserverCore from a persisted data directory.
 * Restores all sessions and replays events to rebuild the runtime graph.
 * Returns a live core with persistence enabled — new events will continue to be written.
 */
export function loadCore(dataDir: string): ObserverCore {
  const pm = new PersistenceManager(dataDir);
  pm.init();

  const { sessions: savedSessions, eventsBySession } = pm.loadAll();

  // Use workspace from first session, or generate a fresh one
  const workspaceId = savedSessions[0]?.workspaceId;

  const events   = new EventLog(pm);
  const graph    = new ProjectionEngine(events);
  const sessions = new SessionEngine(events, graph, workspaceId, pm);

  // Restore sessions. restoreSession() only attaches ACTIVE/PAUSED sessions.
  // Completed/failed sessions also need graph rebuild, so attach them explicitly.
  for (const session of savedSessions) {
    sessions.restoreSession(session);
    const nonActive = session.status === 'COMPLETED' || session.status === 'ARCHIVED' ||
                      session.status === 'CREATING';
    if (nonActive) graph.attachSession(session.id);
  }

  // Replay events — fires subscribers, rebuilds full graph for all sessions
  for (const session of savedSessions) {
    const evts = eventsBySession.get(session.id as string) ?? [];
    for (const event of evts) {
      events.restoreAppend(event);
    }
  }

  return { sessions, events, graph, dispose() { graph.dispose(); } };
}

// Re-export everything consumers need
export * from './types/index.js';
export { EventLog } from './event-log/EventLog.js';
export { ProjectionEngine } from './projection-engine/ProjectionEngine.js';
export { GraphMaterializer } from './projection-engine/GraphMaterializer.js';
export { CorrelationResolver } from './projection-engine/CorrelationResolver.js';
export { SessionEngine } from './session-engine/SessionEngine.js';
export { PersistenceManager } from './persistence/PersistenceManager.js';
export type { EventWriter, SessionWriter, LoadedData } from './persistence/PersistenceManager.js';
export { newNodeId, newEventId, newSessionId, newWorkspaceId, stableNodeId } from './utils/id.js';
export { AlertEngine } from './alerts/AlertEngine.js';
export type { AlertRule, AlertFire, AlertCondition, AlertAction } from './alerts/types.js';
export { PerformanceAnalyzer } from './performance/PerformanceAnalyzer.js';
export type { TimingBucket, PerformanceReport } from './performance/PerformanceAnalyzer.js';
export { SessionSearcher } from './search/SessionSearcher.js';
export type { SessionSearchQuery, SessionSearchResult, SessionMatchMeta } from './search/SessionSearcher.js';
