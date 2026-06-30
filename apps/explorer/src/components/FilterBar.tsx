import { useMemo } from 'react';
import type { RuntimeNode } from '../api/types.js';
import { domainColor } from '../utils/colors.js';

export interface FilterState {
  domain: string | null;   // null = all
  status: string | null;   // null = all
  search: string;
}

export const INITIAL_FILTER: FilterState = { domain: null, status: null, search: '' };

const ALL_STATUSES = ['ACTIVE', 'FAILED', 'COMPLETED', 'PAUSED'];

interface Props {
  nodes: RuntimeNode[];
  filter: FilterState;
  onChange: (f: FilterState) => void;
}

const pill = (label: string, active: boolean, color: string, onClick: () => void) => (
  <button
    key={label}
    onClick={onClick}
    style={{
      padding: '3px 10px',
      borderRadius: '12px',
      border: `1px solid ${active ? color : '#1e293b'}`,
      background: active ? `${color}22` : 'transparent',
      color: active ? color : '#475569',
      fontSize: '11px',
      fontFamily: 'monospace',
      cursor: 'pointer',
      transition: 'all 0.1s',
    }}
  >
    {label}
  </button>
);

export function FilterBar({ nodes, filter, onChange }: Props) {
  const domains = useMemo(
    () => ['all', ...Array.from(new Set(nodes.map((n) => n.domain))).sort()],
    [nodes]
  );

  const visibleStatuses = useMemo(() => {
    const present = new Set<string>(nodes.map((n) => n.status as string));
    return ['all', ...ALL_STATUSES.filter((s) => present.has(s))];
  }, [nodes]);

  const statusColor: Record<string, string> = {
    ACTIVE: '#22c55e', FAILED: '#ef4444', COMPLETED: '#60a5fa',
    PAUSED: '#f59e0b', all: '#64748b',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      padding: '8px 12px',
      background: '#060e1a',
      borderBottom: '1px solid #0f2035',
    }}>
      {/* Domain pills */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ color: '#334155', fontSize: '10px', fontFamily: 'monospace' }}>domain</span>
        {domains.map((d) =>
          pill(
            d,
            d === 'all' ? filter.domain === null : filter.domain === d,
            d === 'all' ? '#64748b' : domainColor(d),
            () => onChange({ ...filter, domain: d === 'all' ? null : d })
          )
        )}
      </div>

      <div style={{ width: '1px', height: '16px', background: '#1e293b' }} />

      {/* Status pills */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ color: '#334155', fontSize: '10px', fontFamily: 'monospace' }}>status</span>
        {visibleStatuses.map((s) =>
          pill(
            s.toLowerCase(),
            s === 'all' ? filter.status === null : filter.status === s,
            statusColor[s] ?? '#64748b',
            () => onChange({ ...filter, status: s === 'all' ? null : s })
          )
        )}
      </div>

      <div style={{ width: '1px', height: '16px', background: '#1e293b' }} />

      {/* Type search */}
      <input
        type="text"
        placeholder="filter by type…"
        value={filter.search}
        onChange={(e) => onChange({ ...filter, search: e.target.value })}
        style={{
          background: '#0a1628',
          border: '1px solid #1e293b',
          borderRadius: '6px',
          color: '#94a3b8',
          fontSize: '11px',
          fontFamily: 'monospace',
          padding: '3px 10px',
          outline: 'none',
          width: '160px',
        }}
      />

      {/* Active filter count badge */}
      {(filter.domain !== null || filter.status !== null || filter.search) && (
        <button
          onClick={() => onChange(INITIAL_FILTER)}
          style={{
            padding: '3px 8px', borderRadius: '6px', border: '1px solid #374151',
            background: '#111827', color: '#6b7280', fontSize: '10px',
            fontFamily: 'monospace', cursor: 'pointer',
          }}
        >
          clear
        </button>
      )}
    </div>
  );
}

export function applyFilter(nodes: RuntimeNode[], filter: FilterState): RuntimeNode[] {
  return nodes.filter((n) => {
    if (filter.domain && n.domain !== filter.domain) return false;
    if (filter.status && (n.status as string) !== filter.status) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!n.type.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}
