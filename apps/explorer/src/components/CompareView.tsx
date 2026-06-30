import { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { api } from '../api/client.js';
import type { RuntimeNode } from '../api/types.js';

type DiffEntry = {
  id: string;
  label: string;
  status: 'new' | 'removed' | 'same' | 'changed';
  beforeNode?: RuntimeNode;
  afterNode?: RuntimeNode;
};

function domainColor(domain: string): string {
  const colors: Record<string, string> = {
    redis: '#ef4444',
    postgres: '#3b82f6',
    'http-server': '#22c55e',
    'http-client': '#a3e635',
    browser: '#f59e0b',
    ws: '#a855f7',
  };
  return colors[domain] ?? '#64748b';
}

function nodeLabel(node: RuntimeNode): string {
  // Trim down long IDs to readable form
  return node.id
    .replace(/^(redis|postgres|http-server|http-client):/, '')
    .replace(/^(pool|client|request):/, '')
    .slice(0, 40);
}

function diffNodes(before: RuntimeNode[], after: RuntimeNode[]): DiffEntry[] {
  const beforeMap = new Map(before.map(n => [n.id, n]));
  const afterMap = new Map(after.map(n => [n.id, n]));
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  const entries: DiffEntry[] = [];
  for (const id of allIds) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);
    if (b && a) {
      entries.push({
        id,
        label: nodeLabel(a),
        status: b.status !== a.status ? 'changed' : 'same',
        beforeNode: b,
        afterNode: a,
      });
    } else if (a) {
      entries.push({ id, label: nodeLabel(a), status: 'new', afterNode: a });
    } else if (b) {
      entries.push({ id, label: nodeLabel(b), status: 'removed', beforeNode: b });
    }
  }

  // Sort: new → changed → same → removed
  const order = { new: 0, changed: 1, same: 2, removed: 3 };
  return entries.sort((a, b) => order[a.status] - order[b.status]);
}

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  new:     { color: '#22c55e', bg: '#052e16', label: '+ new' },
  changed: { color: '#f59e0b', bg: '#1c1007', label: '~ changed' },
  same:    { color: '#475569', bg: 'transparent', label: '= same' },
  removed: { color: '#ef4444', bg: '#1c0507', label: '- removed' },
};

export function CompareView() {
  const { sessions, activeSessionId, nodes: afterNodes } = useStore();
  const [beforeId, setBeforeId] = useState<string>('');
  const [beforeNodes, setBeforeNodes] = useState<RuntimeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSame, setShowSame] = useState(false);

  // Other sessions — exclude active
  const candidates = sessions.filter(s => s.id !== activeSessionId);

  useEffect(() => {
    if (!beforeId) { setBeforeNodes([]); return; }
    setLoading(true);
    api.sessions.nodes(beforeId)
      .then(r => setBeforeNodes(r.nodes))
      .catch(() => setBeforeNodes([]))
      .finally(() => setLoading(false));
  }, [beforeId]);

  if (!activeSessionId) {
    return (
      <div style={{ padding: 16, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
        No active session. Select one in the left panel.
      </div>
    );
  }

  const diff = beforeId ? diffNodes(beforeNodes, afterNodes) : [];
  const filtered = showSame ? diff : diff.filter(e => e.status !== 'same');
  const counts = { new: 0, changed: 0, same: 0, removed: 0 };
  for (const e of diff) counts[e.status]++;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Baseline picker */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          compare against
        </div>
        <select
          value={beforeId}
          onChange={e => setBeforeId(e.target.value)}
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 4,
            color: beforeId ? '#e2e8f0' : '#475569',
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'monospace',
            width: '100%',
          }}
        >
          <option value="">— pick a baseline session —</option>
          {candidates.map(s => (
            <option key={s.id} value={s.id}>
              [{s.status}] {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Summary badges */}
      {beforeId && !loading && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['new', 'changed', 'same', 'removed'] as const).map(k => {
            const style = STATUS_STYLE[k]!;
            return <span
              key={k}
              style={{
                background: style.bg || '#0f172a',
                color: style.color,
                border: `1px solid ${style.color}33`,
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            >
              {counts[k]} {k}
            </span>;
          })}
          <button
            onClick={() => setShowSame(v => !v)}
            style={{
              background: showSame ? '#0f172a' : 'transparent',
              border: '1px solid #1e293b',
              borderRadius: 4,
              color: '#475569',
              padding: '2px 6px',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            {showSame ? 'hide same' : 'show same'}
          </button>
        </div>
      )}

      {/* Diff list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 16, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>loading…</div>
        )}
        {!loading && !beforeId && (
          <div style={{ padding: 16, color: '#334155', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}>
            Pick a baseline session above<br />to diff against current graph.
          </div>
        )}
        {!loading && beforeId && filtered.length === 0 && (
          <div style={{ padding: 16, color: '#334155', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}>
            {diff.length === 0 ? 'No nodes in either session.' : 'No differences. Toggle "show same" to see all.'}
          </div>
        )}
        {!loading && filtered.map(entry => {
          const s = STATUS_STYLE[entry.status] ?? { color: '#64748b', bg: 'transparent', label: '?' };
          const node = entry.afterNode ?? entry.beforeNode!;
          const domain = node.domain ?? '';
          const dc = domainColor(domain);
          return (
            <div
              key={entry.id}
              style={{
                padding: '6px 12px',
                borderBottom: '1px solid #0f172a',
                background: s.bg,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: dc, fontSize: 8, flexShrink: 0 }}>●</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.label}
                </div>
                {entry.status === 'changed' && entry.beforeNode && entry.afterNode && (
                  <div style={{ color: '#475569', fontSize: 10, fontFamily: 'monospace' }}>
                    {entry.beforeNode.status} → {entry.afterNode.status}
                  </div>
                )}
              </div>
              <span style={{ color: s.color, fontSize: 9, fontFamily: 'monospace', flexShrink: 0 }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
