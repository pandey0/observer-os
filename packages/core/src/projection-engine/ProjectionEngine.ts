import type { RuntimeEvent, RuntimeNode, NodeId } from '../types/index.js';
import type { SessionId } from '../types/ids.js';
import type { EventLog } from '../event-log/EventLog.js';
import { GraphMaterializer } from './GraphMaterializer.js';
import { CorrelationResolver } from './CorrelationResolver.js';

export type NodeChangeSubscriber = (node: RuntimeNode) => void;

export class ProjectionEngine {
  private readonly materializer = new GraphMaterializer();
  private readonly correlationResolver = new CorrelationResolver();
  private readonly sessionUnsubs = new Map<SessionId, () => void>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly eventLog: EventLog) {}

  /** Attach to a session — start processing its events in real-time (push path). */
  attachSession(sessionId: SessionId): void {
    if (this.sessionUnsubs.has(sessionId)) return;

    const unsub = this.eventLog.subscribe(sessionId, event => {
      this.processEvent(event);
    });
    this.sessionUnsubs.set(sessionId, unsub);

    // Start correlation cleanup timer on first session
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.correlationResolver.cleanup();
      }, 10_000);
    }
  }

  /** Detach from a session — stop live processing. */
  detachSession(sessionId: SessionId): void {
    this.sessionUnsubs.get(sessionId)?.();
    this.sessionUnsubs.delete(sessionId);
  }

  /**
   * Replay events for a session from the Event Log (pull path).
   * Used for cold starts and historical queries.
   */
  replay(sessionId: SessionId): void {
    const events = this.eventLog.read(sessionId);
    for (const event of events) {
      this.processEvent(event);
    }
  }

  getNode(id: string): RuntimeNode | undefined {
    return this.materializer.getNode(id as NodeId);
  }

  getNodes(sessionId: SessionId): RuntimeNode[] {
    return this.materializer.getNodes(sessionId as string);
  }

  onNodeChange(subscriber: NodeChangeSubscriber): () => void {
    return this.materializer.subscribe(subscriber);
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const unsub of this.sessionUnsubs.values()) unsub();
    this.sessionUnsubs.clear();
  }

  private processEvent(event: RuntimeEvent): void {
    // 1. Apply event to the graph projection
    this.materializer.process(event);

    // 2. Resolve cross-domain correlations
    if (event.correlationId) {
      const match = this.correlationResolver.resolve(event);
      if (match) {
        // Form a cross-domain CORRELATED_WITH edge between the two nodes
        this.materializer.addRelationship(
          match.pending.sourceNodeId,
          match.incoming.sourceNodeId,
          'CORRELATED_WITH'
        );
      }
    }

    // 3. Form causal edges via causedByEventId
    if (event.causedByEventId) {
      const causalEvent = this.eventLog.read(event.sessionId, {
        afterSequence: 0,
      }).find(e => e.id === event.causedByEventId);

      if (causalEvent) {
        this.materializer.addRelationship(
          causalEvent.sourceNodeId,
          event.sourceNodeId,
          'TRIGGERED'
        );
      }
    }
  }
}
