import { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { api } from '../api/client.js';
import type { Annotation } from '../api/client.js';
import { domainColor, SEVERITY_COLORS } from '../utils/colors.js';
import { formatTime, formatDuration } from '../utils/time.js';
import type { RuntimeNode, RuntimeEvent, Severity } from '../api/types.js';

export function Inspector() {
  const { nodes, events, selectedNodeId, activeSessionId } = useStore();
  const node = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const nodeEvents = node ? events.filter((e) => e?.sourceNodeId === node.id || (e?.affectedNodeIds ?? []).includes(node.id)) : [];

  if (!node) {
    return (
      <aside style={{ flex: 1, background: '#0a1628', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <span style={{ fontSize: '28px', color: '#1e293b' }}>◈</span>
        <span style={{ color: '#334155', fontSize: '12px', fontFamily: 'monospace' }}>click a node to inspect</span>
      </aside>
    );
  }

  return (
    <aside style={{
      flex: 1,
      background: '#0a1628',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <NodeDetail node={node} sessionId={activeSessionId ?? ''} />
      <NodeEvents events={nodeEvents} />
      {activeSessionId && (
        <AnnotationSection sessionId={activeSessionId} nodeId={node.id} />
      )}
    </aside>
  );
}

function NodeDetail({ node, sessionId }: { node: RuntimeNode; sessionId: string }) {
  const dColor = domainColor(node.domain);
  const shortType = node.type.includes('/') ? node.type.split('/').pop()! : node.type;
  const [copyState, setCopyState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [copyError, setCopyError] = useState('');

  const copyContext = async () => {
    if (!sessionId) return;
    setCopyState('loading');
    try {
      const pkg = await api.sessions.context(sessionId, {
        anchor: { type: node.status === 'FAILED' ? 'error' : 'node', nodeId: node.id },
        depth: 'DETAILED',
        format: 'MARKDOWN',
      });
      await navigator.clipboard.writeText(pkg.markdownContent);
      setCopyState('done');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('501') || msg.includes('Not Implemented')) {
        setCopyError('Context Engine not built yet (v0.2)');
      } else {
        setCopyError(msg);
      }
      setCopyState('error');
      setTimeout(() => { setCopyState('idle'); setCopyError(''); }, 3000);
    }
  };

  return (
    <div style={{ padding: '14px', borderBottom: '1px solid #1e293b' }}>
      {/* Domain + type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: dColor, display: 'inline-block', boxShadow: `0 0 6px ${dColor}` }} />
        <span style={{ color: dColor, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{node.domain}</span>
      </div>
      <div style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', marginBottom: '4px' }}>{shortType}</div>
      <div style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '10px' }}>{node.id}</div>

      {/* Status + timing */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <InfoChip label="status" value={node.status} />
        <InfoChip label="version" value={String(node.version)} />
        <InfoChip label="rels" value={String(node.relationships.length)} />
      </div>
      <div style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace', marginBottom: '4px' }}>
        created {formatTime(node.createdAt)}
      </div>
      {node.completedAt && (
        <div style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace', marginBottom: '4px' }}>
          duration {formatDuration(node.createdAt, node.completedAt)}
        </div>
      )}

      {/* Metadata */}
      {Object.keys(node.metadata).length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ color: '#334155', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>Metadata</div>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px', maxHeight: '120px', overflowY: 'auto' }}>
            {Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '6px', marginBottom: '2px', fontFamily: 'monospace', fontSize: '10px' }}>
                <span style={{ color: '#475569', flexShrink: 0 }}>{k}:</span>
                <span style={{ color: '#94a3b8', wordBreak: 'break-all' }}>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationships */}
      {node.relationships.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ color: '#334155', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>Relationships</div>
          {node.relationships.map((r) => (
            <div key={r.id} style={{ fontFamily: 'monospace', fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
              {r.type.replace(/_/g, ' ')} → {r.target.slice(0, 24)}…
            </div>
          ))}
        </div>
      )}

      {/* Copy Context button */}
      <button
        onClick={() => void copyContext()}
        disabled={copyState === 'loading'}
        style={{
          marginTop: '14px',
          width: '100%',
          padding: '8px',
          background: copyState === 'done' ? '#052e16' : copyState === 'error' ? '#2d0808' : '#1d4ed8',
          border: `1px solid ${copyState === 'done' ? '#22c55e' : copyState === 'error' ? '#ef4444' : '#2563eb'}`,
          borderRadius: '6px',
          color: copyState === 'done' ? '#22c55e' : copyState === 'error' ? '#f87171' : '#fff',
          fontSize: '12px',
          fontFamily: 'monospace',
          fontWeight: 600,
          cursor: copyState === 'loading' ? 'wait' : 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {copyState === 'idle' ? '⎘  Copy Context' :
         copyState === 'loading' ? '…  Building context' :
         copyState === 'done' ? '✓  Copied!' :
         copyError || 'Error'}
      </button>
    </div>
  );
}

function NodeEvents({ events }: { events: RuntimeEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
      <div style={{ color: '#334155', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
        Events ({events.length})
      </div>
      {[...events].reverse().map((evt) => {
        const sev = evt.severity as Severity;
        const c = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS['INFO'];
        const shortType = evt.type.includes('/') ? evt.type.split('/').pop() : evt.type;
        return (
          <div key={evt.id} style={{
            display: 'flex', gap: '6px', alignItems: 'flex-start',
            padding: '5px 0', borderBottom: '1px solid #0f172a', fontFamily: 'monospace',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: '3px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: c.text, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shortType}
              </div>
              <div style={{ color: '#334155', fontSize: '10px' }}>
                {formatTime(evt.occurredAt)} · #{evt.sequenceNumber}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', padding: '2px 6px' }}>
      <span style={{ color: '#334155', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color: '#94a3b8', fontSize: '10px', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function AnnotationSection({ sessionId, nodeId }: { sessionId: string; nodeId: string }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.annotations.list(sessionId)
      .then(r => setAnnotations(r.annotations.filter(a => a.nodeId === nodeId)))
      .catch(() => {});
  }, [sessionId, nodeId]);

  const addAnnotation = async () => {
    if (!text.trim()) return;
    const ann = await api.annotations.create(sessionId, { nodeId, text: text.trim() });
    setAnnotations(prev => [...prev, ann]);
    setText('');
    setAdding(false);
  };

  const deleteAnnotation = (id: string) => {
    api.annotations.delete(sessionId, id).then(() =>
      setAnnotations(prev => prev.filter(a => a.id !== id))
    ).catch(() => {});
  };

  return (
    <div style={{ borderTop: '1px solid #1e293b', padding: '8px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: '#475569', fontSize: 10, fontFamily: 'monospace' }}>
          annotations ({annotations.length})
        </span>
        <button
          onClick={() => setAdding(a => !a)}
          style={{ background: 'transparent', border: '1px solid #1e293b', borderRadius: 3, color: '#64748b', padding: '1px 6px', cursor: 'pointer', fontSize: 9, fontFamily: 'monospace' }}
        >
          {adding ? 'cancel' : '+ add'}
        </button>
      </div>

      {annotations.map(ann => (
        <div key={ann.id} style={{ background: '#0a1628', border: '1px solid #1e293b', borderRadius: 4, padding: '4px 6px', marginBottom: 4, fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', position: 'relative' }}>
          {ann.text}
          <button
            onClick={() => deleteAnnotation(ann.id)}
            style={{ position: 'absolute', right: 4, top: 2, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}
          >×</button>
        </div>
      ))}

      {adding && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void addAnnotation(); }}
            placeholder="add note…"
            style={{ flex: 1, background: '#060e1a', border: '1px solid #1e293b', borderRadius: 3, color: '#e2e8f0', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}
          />
          <button
            onClick={() => void addAnnotation()}
            disabled={!text.trim()}
            style={{ background: '#1d4ed8', border: 'none', borderRadius: 3, color: '#fff', padding: '3px 8px', cursor: 'pointer', fontSize: 9 }}
          >
            add
          </button>
        </div>
      )}
    </div>
  );
}
