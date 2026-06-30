import { useState } from 'react';
import type { TimingBucket, RuntimeNode } from '../api/types.js';

interface Props {
  buckets: TimingBucket[];
  nodes: RuntimeNode[];
}

type SortKey = 'p50Ms' | 'p95Ms' | 'p99Ms' | 'count';
type SortDir = 'asc' | 'desc';

function colorForMs(ms: number): string {
  if (ms < 100) return '#22c55e';
  if (ms < 500) return '#f59e0b';
  return '#ef4444';
}

export function SlowestTable({ buckets, nodes }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'p95Ms', dir: 'desc' });

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  const sorted = [...buckets]
    .sort((a, b) => {
      const mul = sort.dir === 'desc' ? -1 : 1;
      return (a[sort.key] - b[sort.key]) * mul;
    })
    .slice(0, 10);

  const headerCell = (label: string, key?: SortKey): React.CSSProperties => ({
    padding: '3px 6px',
    color: key && sort.key === key ? '#94a3b8' : '#475569',
    fontSize: 9,
    fontFamily: 'monospace',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    cursor: key ? 'pointer' : 'default',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  });

  const cell: React.CSSProperties = {
    padding: '3px 6px',
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  if (buckets.length === 0) {
    return (
      <div style={{ color: '#334155', fontSize: '10px', fontFamily: 'monospace', textAlign: 'center', padding: '8px 0' }}>
        no slowest data
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b' }}>
            <th style={{ ...headerCell('Node'), width: '30%', textAlign: 'left' }}>Node</th>
            <th style={{ ...headerCell('Type'), width: '25%', textAlign: 'left' }}>Type</th>
            <th
              style={{ ...headerCell('Count', 'count'), width: '15%', textAlign: 'right' }}
              onClick={() => toggleSort('count')}
            >
              Cnt{sort.key === 'count' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
            <th
              style={{ ...headerCell('P50', 'p50Ms'), width: '10%', textAlign: 'right' }}
              onClick={() => toggleSort('p50Ms')}
            >
              P50{sort.key === 'p50Ms' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
            <th
              style={{ ...headerCell('P95', 'p95Ms'), width: '10%', textAlign: 'right' }}
              onClick={() => toggleSort('p95Ms')}
            >
              P95{sort.key === 'p95Ms' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
            <th
              style={{ ...headerCell('P99', 'p99Ms'), width: '10%', textAlign: 'right' }}
              onClick={() => toggleSort('p99Ms')}
            >
              P99{sort.key === 'p99Ms' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => {
            const nodeName = nodes.find((n) => n.id === b.nodeId)?.type ?? b.nodeId.slice(0, 8);
            const shortType = b.eventType.includes('/') ? b.eventType.split('/').pop()! : b.eventType;
            return (
              <tr key={`${b.nodeId}-${b.eventType}-${i}`} style={{ background: i % 2 === 0 ? 'transparent' : '#060e1a05' }}>
                <td style={{ ...cell, color: '#64748b' }} title={b.nodeId}>{nodeName}</td>
                <td style={{ ...cell }} title={b.eventType}>{shortType}</td>
                <td style={{ ...cell, textAlign: 'right', color: '#64748b' }}>{b.count}</td>
                <td style={{ ...cell, textAlign: 'right', color: colorForMs(b.p50Ms) }}>{b.p50Ms}</td>
                <td style={{ ...cell, textAlign: 'right', color: colorForMs(b.p95Ms) }}>{b.p95Ms}</td>
                <td style={{ ...cell, textAlign: 'right', color: colorForMs(b.p99Ms) }}>{b.p99Ms}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
