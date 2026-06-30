import type { TimingBucket } from '../api/types.js';

interface Props {
  buckets: TimingBucket[];
  maxP95: number;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function colorFor(p95Ms: number): string {
  if (p95Ms < 100) return '#22c55e';
  if (p95Ms < 500) return '#f59e0b';
  return '#ef4444';
}

export function BucketHistogram({ buckets, maxP95 }: Props) {
  if (buckets.length === 0) {
    return (
      <div style={{ color: '#334155', fontSize: '10px', fontFamily: 'monospace', textAlign: 'center', padding: '8px 0' }}>
        no timing data
      </div>
    );
  }

  return (
    <div style={{ padding: '0 2px' }}>
      {buckets.map((bucket, i) => (
        <div
          key={`${bucket.nodeId}-${bucket.eventType}-${i}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
        >
          <span style={{
            width: 80,
            fontSize: 9,
            color: '#64748b',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}>
            {truncate(bucket.eventType, 12)}
          </span>
          <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3 }}>
            <div style={{
              width: maxP95 > 0 ? `${(bucket.p95Ms / maxP95) * 100}%` : '0%',
              height: '100%',
              borderRadius: 3,
              background: colorFor(bucket.p95Ms),
            }} />
          </div>
          <span style={{
            width: 50,
            fontSize: 9,
            color: '#94a3b8',
            textAlign: 'right',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}>
            {bucket.p95Ms}ms
          </span>
        </div>
      ))}
    </div>
  );
}
