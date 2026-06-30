import type { RuntimeEvent, EmitInput, EventReadOptions } from '../types/event.js';
import type { SessionId, WorkspaceId } from '../types/ids.js';
import type { EventWriter } from '../persistence/PersistenceManager.js';
import { newEventId } from '../utils/id.js';

export type EventSubscriber = (event: RuntimeEvent) => void;

export class EventLog {
  // Append-only store: sessionId → ordered event list
  private readonly store = new Map<SessionId, RuntimeEvent[]>();
  private readonly subscribers = new Map<SessionId, Set<EventSubscriber>>();
  private readonly globalSubscribers = new Set<EventSubscriber>();
  private sequence = 0;

  constructor(private readonly writer?: EventWriter) {}

  append(sessionId: SessionId, workspaceId: WorkspaceId, input: EmitInput): RuntimeEvent {
    const event: RuntimeEvent = {
      id: newEventId(),
      type: input.type,
      sourceNodeId: input.sourceNodeId,
      affectedNodeIds: input.affectedNodeIds ?? [],
      occurredAt: input.occurredAt ?? Date.now(),
      recordedAt: Date.now(),
      sequenceNumber: ++this.sequence,
      payload: input.payload,
      causedByEventId: input.causedByEventId,
      correlationId: input.correlationId,
      sessionId,
      workspaceId,
      severity: input.severity ?? 'INFO',
      schemaVersion: input.schemaVersion ?? '1.0.0',
    };

    // Freeze before storage — events are immutable after recording (RFC-0004)
    const frozen = Object.freeze({
      ...event,
      affectedNodeIds: Object.freeze([...event.affectedNodeIds]),
      payload: Object.freeze({ ...event.payload }),
    }) as RuntimeEvent;

    if (!this.store.has(sessionId)) {
      this.store.set(sessionId, []);
    }
    this.store.get(sessionId)!.push(frozen);

    this.notify(sessionId, frozen);
    this.writer?.writeEvent(frozen);
    return frozen;
  }

  /**
   * Restore a previously-persisted event back into the in-memory store.
   * Fires subscribers (so ProjectionEngine rebuilds graph) but does NOT write to disk.
   * Must call SessionEngine.restoreSession() + ProjectionEngine.attachSession() first.
   */
  restoreAppend(event: RuntimeEvent): void {
    if (!this.store.has(event.sessionId)) {
      this.store.set(event.sessionId, []);
    }
    // occurredAt may be absent in events saved before it was required — default to recordedAt
    const safe = event.occurredAt ? event : { ...event, occurredAt: event.recordedAt };
    this.store.get(event.sessionId)!.push(safe);
    if (event.sequenceNumber > this.sequence) {
      this.sequence = event.sequenceNumber;
    }
    this.notify(event.sessionId, event);
  }

  read(sessionId: SessionId, options: EventReadOptions = {}): RuntimeEvent[] {
    let events = this.store.get(sessionId) ?? [];

    if (options.afterSequence !== undefined) {
      const cutoff = options.afterSequence;
      events = events.filter(e => e.sequenceNumber > cutoff);
    }
    if (options.nodeId !== undefined) {
      const id = options.nodeId;
      events = events.filter(
        e => e.sourceNodeId === id || e.affectedNodeIds.includes(id)
      );
    }
    if (options.eventType !== undefined) {
      const t = options.eventType;
      events = events.filter(e => e.type === t);
    }
    if (options.severity !== undefined) {
      const severityOrder = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const;
      const minIdx = severityOrder.indexOf(options.severity);
      events = events.filter(e => severityOrder.indexOf(e.severity) >= minIdx);
    }
    if (options.limit !== undefined) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  count(sessionId: SessionId): number {
    return this.store.get(sessionId)?.length ?? 0;
  }

  subscribe(sessionId: SessionId, subscriber: EventSubscriber): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    this.subscribers.get(sessionId)!.add(subscriber);
    return () => {
      this.subscribers.get(sessionId)?.delete(subscriber);
    };
  }

  /** Subscribe to ALL events across ALL sessions. */
  subscribeAll(subscriber: EventSubscriber): () => void {
    this.globalSubscribers.add(subscriber);
    return () => this.globalSubscribers.delete(subscriber);
  }

  private notify(sessionId: SessionId, event: RuntimeEvent): void {
    const subs = this.subscribers.get(sessionId);
    if (subs) {
      for (const sub of subs) {
        try { sub(event); } catch { /* subscriber errors must not break event delivery */ }
      }
    }
    for (const sub of this.globalSubscribers) {
      try { sub(event); } catch { /* ignore */ }
    }
  }
}
