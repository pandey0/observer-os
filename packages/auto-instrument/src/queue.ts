export interface QueuedEvent {
  type: string;
  sourceNodeId: string;
  occurredAt: number;
  severity?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

export class EventQueue {
  private events: QueuedEvent[] = [];
  private flushing = false;
  private onFlush: ((events: QueuedEvent) => void) | null = null;

  push(event: QueuedEvent): void {
    this.events.push(event);
    if (this.onFlush) this.flush();
  }

  setFlushHandler(handler: (events: QueuedEvent) => void): void {
    this.onFlush = handler;
    this.flush();
  }

  private flush(): void {
    if (this.flushing || !this.onFlush || this.events.length === 0) return;
    this.flushing = true;
    const toFlush = this.events.splice(0);
    const handler = this.onFlush;
    setImmediate(() => {
      toFlush.forEach(e => handler(e));
      this.flushing = false;
      // Re-check: events may have been pushed while this flush was in progress
      if (this.events.length > 0) this.flush();
    });
  }
}
