import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { RuntimeNode } from '../api/types.js';
import { domainColor, STATUS_STYLES } from '../utils/colors.js';
import { useStore } from '../store/index.js';

// Full React Flow node type (data shape + RF fields)
export type RuntimeNodeRF = Node<{ node: RuntimeNode }>;

export const RuntimeNodeCard = memo(function RuntimeNodeCard({ data, selected }: NodeProps<RuntimeNodeRF>) {
  const { setSelectedNode } = useStore();
  const perf = useStore((s) => s.performanceReport);
  const node = data.node;
  if (!node) return null;

  const p95 = perf?.buckets
    .filter((b) => b.nodeId === node.id)
    .reduce((max, b) => Math.max(max, b.p95Ms), 0) ?? 0;

  const statusStyle = STATUS_STYLES[node.status] ?? STATUS_STYLES['DISCOVERED'];
  const dColor = domainColor(node.domain);
  const shortType = node.type.includes('/') ? node.type.split('/').pop()! : node.type;

  return (
    <div
      onClick={() => setSelectedNode(node.id)}
      style={{
        position: 'relative',
        width: '210px',
        background: statusStyle.bg,
        border: `2px solid ${selected ? '#3b82f6' : node.status === 'FAILED' ? '#ef4444' : statusStyle.border}`,
        borderRadius: '8px',
        padding: '10px 12px',
        cursor: 'pointer',
        boxShadow: selected
          ? '0 0 0 2px rgba(59,130,246,0.3)'
          : node.status === 'FAILED'
          ? '0 0 12px rgba(239,68,68,0.3)'
          : 'none',
        transition: 'border-color 0.15s',
        fontFamily: 'monospace',
      }}
    >
      {p95 > 0 && (
        <div style={{
          position: 'absolute', top: 2, right: 2,
          fontSize: 8, fontFamily: 'monospace',
          color: p95 >= 500 ? '#ef4444' : p95 >= 100 ? '#f59e0b' : '#22c55e',
          background: '#060e1a', padding: '1px 3px', borderRadius: 2,
        }}>
          p95:{p95}ms
        </div>
      )}
      <Handle type="target" position={Position.Top} style={{ background: '#334155', border: 'none', width: '8px', height: '8px' }} />

      {/* Domain bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{
          display: 'inline-block', width: '8px', height: '8px',
          borderRadius: '50%', background: dColor, flexShrink: 0,
          boxShadow: `0 0 4px ${dColor}`,
        }} />
        <span style={{ color: dColor, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {node.domain}
        </span>
        <div style={{ flex: 1 }} />
        <StatusBadge status={node.status} />
      </div>

      {/* Node type */}
      <div style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortType}
      </div>

      {/* Node ID (truncated) */}
      <div style={{ color: '#475569', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
        {node.id.length > 28 ? `${node.id.slice(0, 28)}…` : node.id}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#334155', border: 'none', width: '8px', height: '8px' }} />
    </div>
  );
});

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    ACTIVE:     { bg: '#052e16', text: '#22c55e' },
    COMPLETED:  { bg: '#1e293b', text: '#64748b' },
    FAILED:     { bg: '#2d0808', text: '#ef4444' },
    DISCOVERED: { bg: '#1e293b', text: '#64748b' },
    DESTROYED:  { bg: '#1e293b', text: '#334155' },
    ARCHIVED:   { bg: '#1e293b', text: '#334155' },
  };
  const c = colors[status] ?? { bg: '#1e293b', text: '#64748b' };
  return (
    <span style={{
      fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
      background: c.bg, color: c.text,
      fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      {status}
    </span>
  );
}
