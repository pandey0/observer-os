import { useRef, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { SEVERITY_COLORS } from '../utils/colors.js';
import { formatTime } from '../utils/time.js';
import type { Severity } from '../api/types.js';

export function Timeline() {
  const { events, selectedNodeId, setSelectedNode, replayCursor, setReplayCursor } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isReplaying = replayCursor !== null;

  // Auto-scroll to latest — suppress while replaying
  useEffect(() => {
    if (!isReplaying && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [events.length, isReplaying]);

  const visible = events.filter(Boolean).slice(-100);

  if (visible.length === 0) {
    return (
      <div style={{
        height: '52px', borderTop: '1px solid #1e293b', background: '#060e1a',
        display: 'flex', alignItems: 'center', paddingLeft: '16px',
        color: '#334155', fontSize: '12px', fontFamily: 'monospace', flexShrink: 0,
      }}>
        no events — start your app
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid #1e293b', background: '#060e1a', flexShrink: 0 }}>
      {/* Replay mode banner */}
      {isReplaying && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '4px 12px', background: '#0c1a2e',
          borderBottom: '1px solid #1e3a5f',
        }}>
          <span style={{ color: '#60a5fa', fontSize: '10px', fontFamily: 'monospace' }}>
            REPLAY — {new Date(replayCursor!).toISOString().slice(11, 23)}
          </span>
          <button
            onClick={() => setReplayCursor(null)}
            style={{
              padding: '1px 8px', borderRadius: '4px',
              border: '1px solid #1e3a5f', background: '#0a1628',
              color: '#60a5fa', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer',
            }}
          >
            live
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0 12px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
        }}
      >
        {visible.map((evt) => {
          if (!evt?.type) return null;
          const sev = (evt.severity ?? 'INFO') as Severity;
          const c = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS['INFO'];
          const isSelected = evt.sourceNodeId === selectedNodeId;
          const isCursor = isReplaying && evt.occurredAt === replayCursor;
          const isFuture = isReplaying && evt.occurredAt > replayCursor!;
          const shortType = evt.type.includes('/') ? evt.type.split('/').pop() : evt.type;

          return (
            <button
              key={evt.id}
              onClick={() => {
                setSelectedNode(evt.sourceNodeId);
                setReplayCursor(evt.occurredAt);
              }}
              title={`${evt.type}\n${new Date(evt.occurredAt).toISOString()}\nClick to replay up to this point`}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                borderRadius: '5px',
                border: `1px solid ${isCursor ? '#60a5fa' : isSelected ? '#3b82f6' : 'transparent'}`,
                background: isCursor ? '#0c1a2e' : isSelected ? '#0c1a2e' : c.bg,
                cursor: 'pointer',
                opacity: isFuture ? 0.3 : 1,
                transition: 'opacity 0.15s, border-color 0.1s',
              }}
            >
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: isFuture ? '#334155' : c.dot, flexShrink: 0,
              }} />
              <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'monospace', flexShrink: 0 }}>
                {formatTime(evt.occurredAt)}
              </span>
              <span style={{
                color: isFuture ? '#334155' : c.text,
                fontSize: '11px', fontFamily: 'monospace',
                maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {shortType}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
