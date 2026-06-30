import type { Session, CreateSessionOptions, EmitInput, RuntimeEvent, RuntimeNode } from '../types/index.js';
import type { SessionId, WorkspaceId } from '../types/ids.js';
import type { SessionWriter } from '../persistence/PersistenceManager.js';
import { newSessionId, newWorkspaceId } from '../utils/id.js';
import type { EventLog } from '../event-log/EventLog.js';
import type { ProjectionEngine } from '../projection-engine/ProjectionEngine.js';

export class SessionEngine {
  private readonly sessions = new Map<SessionId, Session>();
  private readonly defaultWorkspaceId: WorkspaceId;

  constructor(
    private readonly eventLog: EventLog,
    private readonly projectionEngine: ProjectionEngine,
    workspaceId?: WorkspaceId,
    private readonly writer?: SessionWriter,
  ) {
    this.defaultWorkspaceId = workspaceId ?? newWorkspaceId();
  }

  /** Create and immediately activate a new Session. */
  create(options: CreateSessionOptions = {}): Session {
    const id = newSessionId();
    const workspaceId = options.workspaceId ?? this.defaultWorkspaceId;
    const session: Session = {
      id,
      workspaceId,
      name: options.name ?? `Session ${new Date().toLocaleTimeString()}`,
      status: 'ACTIVE',
      startedAt: Date.now(),
      tags: options.tags ?? [],
      eventCount: 0,
      nodeCount: 0,
    };

    this.sessions.set(id, session);
    this.projectionEngine.attachSession(id);
    this.writer?.writeSession(session);
    return session;
  }

  /**
   * Restore a previously-persisted session. Does NOT write to disk.
   * Re-attaches the projection engine for ACTIVE/PAUSED sessions so they
   * receive replayed events during startup.
   */
  restoreSession(session: Session): void {
    this.sessions.set(session.id, session);
    if (session.status === 'ACTIVE' || session.status === 'PAUSED') {
      this.projectionEngine.attachSession(session.id);
    }
  }

  /** Emit a RuntimeEvent into a Session's Event Log. */
  emit(sessionId: SessionId, input: EmitInput): RuntimeEvent {
    const session = this.require(sessionId);
    if (session.status !== 'ACTIVE') {
      throw new Error(`Cannot emit into session ${sessionId} with status ${session.status}`);
    }
    const event = this.eventLog.append(sessionId, session.workspaceId, input);

    // Update session event count
    this.sessions.set(sessionId, {
      ...session,
      eventCount: session.eventCount + 1,
    });

    return event;
  }

  /** Pause a Session — no new events accepted until resumed. */
  pause(sessionId: SessionId): Session {
    const session = this.require(sessionId);
    if (session.status !== 'ACTIVE') {
      throw new Error(`Cannot pause session with status ${session.status}`);
    }
    const updated: Session = { ...session, status: 'PAUSED', pausedAt: Date.now() };
    this.sessions.set(sessionId, updated);
    this.writer?.writeSession(updated);
    return updated;
  }

  /** Resume a paused Session. */
  resume(sessionId: SessionId): Session {
    const session = this.require(sessionId);
    if (session.status !== 'PAUSED') {
      throw new Error(`Cannot resume session with status ${session.status}`);
    }
    const updated: Session = { ...session, status: 'ACTIVE', pausedAt: undefined };
    this.sessions.set(sessionId, updated);
    this.writer?.writeSession(updated);
    return updated;
  }

  /** End a Session and detach its Projection Engine listener. */
  end(sessionId: SessionId): Session {
    const session = this.require(sessionId);
    if (session.status === 'COMPLETED' || session.status === 'ARCHIVED') {
      return session;
    }

    const nodeCount = this.projectionEngine.getNodes(sessionId).length;
    const eventCount = this.eventLog.count(sessionId);

    const completed: Session = {
      ...session,
      status: 'COMPLETED',
      endedAt: Date.now(),
      eventCount,
      nodeCount,
    };

    this.sessions.set(sessionId, completed);
    this.projectionEngine.detachSession(sessionId);
    this.writer?.writeSession(completed);
    return completed;
  }

  get(sessionId: SessionId): Session | undefined {
    return this.sessions.get(sessionId);
  }

  list(workspaceId?: WorkspaceId): Session[] {
    const all = Array.from(this.sessions.values());
    return workspaceId ? all.filter(s => s.workspaceId === workspaceId) : all;
  }

  /** Get graph nodes for a session. */
  getNodes(sessionId: SessionId): RuntimeNode[] {
    return this.projectionEngine.getNodes(sessionId);
  }

  /** Get events for a session. */
  getEvents(sessionId: SessionId): RuntimeEvent[] {
    return this.eventLog.read(sessionId);
  }

  private require(sessionId: SessionId): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session;
  }
}
