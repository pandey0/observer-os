import type { RuntimeEvent } from '../types/event.js';

interface PendingEntry {
  readonly event: RuntimeEvent;
  readonly addedAt: number;
}

export interface CorrelationMatch {
  readonly incoming: RuntimeEvent;
  readonly pending: RuntimeEvent;
}

export class CorrelationResolver {
  private readonly pending = new Map<string, PendingEntry[]>();

  constructor(private readonly timeoutMs = 10_000) {}

  /**
   * Process an event with a correlationId.
   * Returns a match if another event with the same correlationId is already pending
   * (from a different domain). Returns null if added to pending table.
   */
  resolve(event: RuntimeEvent): CorrelationMatch | null {
    const { correlationId } = event;
    if (!correlationId) return null;

    const entries = this.pending.get(correlationId) ?? [];

    // Only match across different domains to avoid self-correlation
    const match = entries.find(e => e.event.sessionId === event.sessionId &&
      this.extractDomain(e.event.type) !== this.extractDomain(event.type)
    );

    if (match) {
      // Remove matched entry
      const remaining = entries.filter(e => e !== match);
      if (remaining.length === 0) {
        this.pending.delete(correlationId);
      } else {
        this.pending.set(correlationId, remaining);
      }
      return { incoming: event, pending: match.event };
    }

    // No match — add to pending
    const updated = [...entries, { event, addedAt: Date.now() }];
    this.pending.set(correlationId, updated);
    return null;
  }

  cleanup(): void {
    const cutoff = Date.now() - this.timeoutMs;
    for (const [id, entries] of this.pending) {
      const fresh = entries.filter(e => e.addedAt > cutoff);
      if (fresh.length === 0) {
        this.pending.delete(id);
      } else {
        this.pending.set(id, fresh);
      }
    }
  }

  pendingCount(): number {
    let total = 0;
    for (const entries of this.pending.values()) total += entries.length;
    return total;
  }

  private extractDomain(eventType: string): string {
    // "observer.postgres/query.started" → "postgres"
    const slashIdx = eventType.indexOf('/');
    const namespace = slashIdx === -1 ? eventType : eventType.slice(0, slashIdx);
    const dotIdx = namespace.lastIndexOf('.');
    return dotIdx === -1 ? namespace : namespace.slice(dotIdx + 1);
  }
}
