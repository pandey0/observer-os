import { describe, it, expect, vi } from 'vitest';
import { EventQueue } from '../queue';

describe('EventQueue', () => {
  it('queues events before flush handler is set', () => {
    const q = new EventQueue();
    q.push({ type: 'test', sourceNodeId: 'n1', occurredAt: 1 });
    q.push({ type: 'test2', sourceNodeId: 'n2', occurredAt: 2 });
    // No flush handler yet — events held
    const handler = vi.fn();
    q.setFlushHandler(handler);
    // flush is async via setImmediate
    return new Promise<void>(resolve => setImmediate(() => {
      expect(handler).toHaveBeenCalledTimes(2);
      resolve();
    }));
  });

  it('flushes new events immediately when handler is set', () => {
    const q = new EventQueue();
    const handler = vi.fn();
    q.setFlushHandler(handler);
    q.push({ type: 'test', sourceNodeId: 'n1', occurredAt: 1 });
    return new Promise<void>(resolve => setImmediate(() => {
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'test' }));
      resolve();
    }));
  });

  it('does not double-flush', () => {
    const q = new EventQueue();
    const handler = vi.fn();
    q.push({ type: 'a', sourceNodeId: 'n1', occurredAt: 1 });
    q.push({ type: 'b', sourceNodeId: 'n2', occurredAt: 2 });
    q.setFlushHandler(handler);
    return new Promise<void>(resolve => setImmediate(() => {
      expect(handler).toHaveBeenCalledTimes(2);
      resolve();
    }));
  });
});
