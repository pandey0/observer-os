import type { RuntimeEvent } from '../types/event.js';
import type { NodeId } from '../types/ids.js';

export interface TimingBucket {
  nodeId: NodeId;
  eventType: string;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface PerformanceReport {
  sessionId: string;
  generatedAt: number;
  buckets: TimingBucket[];
  slowest: TimingBucket[];
}

// Event types that carry a duration payload field
const TIMED_EVENT_PATTERNS = [
  'observer.express/request',
  'observer.postgres/query',
  'observer.browser/network',
  'observer.react/component',
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

export class PerformanceAnalyzer {
  /**
   * Analyze all events in a session and return per-node timing statistics.
   * Only events with a numeric `duration` field in their payload are included.
   */
  analyze(sessionId: string, events: readonly RuntimeEvent[]): PerformanceReport {
    const byNode = new Map<string, { type: string; durations: number[] }>();

    for (const ev of events) {
      const duration = (ev.payload as Record<string, unknown>)?.duration;
      if (typeof duration !== 'number') continue;

      // Only include events that belong to known timed patterns
      const isTimed = TIMED_EVENT_PATTERNS.some((p) => ev.type.startsWith(p));
      if (!isTimed) continue;

      const key = `${ev.sourceNodeId}::${ev.type}`;
      if (!byNode.has(key)) {
        byNode.set(key, { type: ev.type, durations: [] });
      }
      byNode.get(key)!.durations.push(duration);
    }

    const buckets: TimingBucket[] = [];

    for (const [key, { type, durations }] of byNode) {
      const nodeId = key.split('::')[0] as NodeId;
      const sorted = [...durations].sort((a, b) => a - b);
      const total = sorted.reduce((s, d) => s + d, 0);

      buckets.push({
        nodeId,
        eventType: type,
        count: sorted.length,
        totalMs: total,
        minMs: sorted[0] ?? 0,
        maxMs: sorted[sorted.length - 1] ?? 0,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
      });
    }

    // Sort by p95 descending
    buckets.sort((a, b) => b.p95Ms - a.p95Ms);

    return {
      sessionId,
      generatedAt: Date.now(),
      buckets,
      slowest: buckets.slice(0, 10),
    };
  }
}
