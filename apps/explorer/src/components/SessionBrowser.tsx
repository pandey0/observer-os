import { useEffect, useCallback, useState } from 'react';
import { useStore } from '../store/index.js';
import { api } from '../api/client.js';
import { connectSession } from '../api/ws.js';
import type { ApiSession, SessionSearchResult } from '../api/types.js';
import { timeAgo } from '../utils/time.js';
import { useSessionSearch } from '../hooks/useSessionSearch.js';

const STATUS_ICONS: Record<string, string> = {
  ACTIVE: '●',
  PAUSED: '◉',
  COMPLETED: '○',
  ARCHIVED: '○',
  FAILED: '✕',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  PAUSED: '#f59e0b',
  COMPLETED: '#475569',
  ARCHIVED: '#334155',
  FAILED: '#ef4444',
};

export function SessionBrowser() {
  const {
    sessions, setSessions,
    activeSessionId, setActiveSession,
    setNodes, setEvents, setWsStatus, setWsReconnectAttempt,
    clearSessionData, upsertNode, appendEvent,
  } = useStore();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [wsCleanup, setWsCleanup] = useState<(() => void) | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const COMPLETED_CAP = 10;

  const searchResults = useSessionSearch(debouncedQuery);

  // 300ms debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const loadSessions = useCallback(async () => {
    try {
      const sessions = await api.sessions.list();
      setSessions(sessions.sort((a, b) => b.startedAt - a.startedAt));
    } catch { /* daemon offline — fail silently */ }
  }, [setSessions]);

  useEffect(() => {
    void loadSessions();
    const t = setInterval(loadSessions, 5_000);
    return () => clearInterval(t);
  }, [loadSessions]);

  const selectSession = useCallback(async (id: string) => {
    // Tear down previous WS and reset reconnect state
    wsCleanup?.();
    clearSessionData();
    setActiveSession(id);
    setWsReconnectAttempt(0);
    setWsStatus('connecting');

    // Load initial data
    try {
      const [eventsRes, nodesRes] = await Promise.all([
        api.sessions.events(id, { limit: '200' }),
        api.sessions.nodes(id),
      ]);
      setEvents(eventsRes.events);
      setNodes(nodesRes.nodes);
    } catch { /* swallow — WS snapshot will fill it */ }

    // Open WS for live updates
    const cleanup = connectSession(id, {
      onConnect: () => { setWsStatus('connected'); setWsReconnectAttempt(0); },
      onDisconnect: () => setWsStatus('disconnected'),
      onReconnecting: (attempt) => { setWsStatus('reconnecting'); setWsReconnectAttempt(attempt); },
      onSnapshot: (events, nodes) => { setEvents(events); setNodes(nodes); },
      onEvent: (event) => appendEvent(event),
      onNode: (node) => upsertNode(node),
    });
    setWsCleanup(() => cleanup);
  }, [wsCleanup, clearSessionData, setActiveSession, setWsStatus, setWsReconnectAttempt, setEvents, setNodes, appendEvent, upsertNode]);

  // Cleanup WS on unmount
  useEffect(() => () => wsCleanup?.(), [wsCleanup]);

  const createSession = async () => {
    const name = newName.trim() || `session-${Date.now()}`;
    try {
      await api.sessions.create(name);
      setNewName('');
      setCreating(false);
      await loadSessions();
    } catch { /* daemon offline */ }
  };

  const endSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.sessions.end(id);
      if (activeSessionId === id) { wsCleanup?.(); clearSessionData(); setActiveSession(null); }
      await loadSessions();
    } catch { /* swallow */ }
  };

  const grouped = {
    ACTIVE:    sessions.filter((s) => s.status === 'ACTIVE'),
    PAUSED:    sessions.filter((s) => s.status === 'PAUSED'),
    COMPLETED: sessions.filter((s) => s.status === 'COMPLETED' || s.status === 'ARCHIVED' || s.status === 'FAILED'),
  };

  return (
    <aside style={{
      width: '240px',
      flexShrink: 0,
      background: '#0a1628',
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Sessions
        </span>
        <button
          onClick={() => setCreating(true)}
          style={{ color: '#60a5fa', fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          title="New session"
        >
          +
        </button>
      </div>

      {/* Search input */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b' }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="search sessions…"
          style={{
            width: '100%',
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '4px',
            color: '#e2e8f0',
            padding: '4px 8px',
            fontSize: '11px',
            fontFamily: 'monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* New session input */}
      {creating && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #1e293b', display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void createSession(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="session name"
            style={{
              flex: 1, background: '#0f172a', border: '1px solid #334155',
              borderRadius: '4px', color: '#f1f5f9', fontSize: '12px',
              padding: '4px 8px', fontFamily: 'monospace', outline: 'none',
            }}
          />
          <button
            onClick={() => void createSession()}
            style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}
          >
            Go
          </button>
        </div>
      )}

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {debouncedQuery ? (
          // Search results
          searchResults.length === 0 ? (
            <div style={{ padding: '24px 14px', color: '#334155', fontSize: '12px', textAlign: 'center' }}>
              No results for "{debouncedQuery}"
            </div>
          ) : (
            searchResults.map((result) => (
              <SearchResultRow
                key={result.session.id}
                result={result}
                active={result.session.id === activeSessionId}
                onSelect={() => void selectSession(result.session.id)}
              />
            ))
          )
        ) : (
          // Normal grouped list
          <>
            {(['ACTIVE', 'PAUSED', 'COMPLETED'] as const).map((group) => {
              const allItems = grouped[group];
              if (allItems.length === 0) return null;
              const isCompleted = group === 'COMPLETED';
              const visible = isCompleted && !showAllCompleted
                ? allItems.slice(0, COMPLETED_CAP)
                : allItems;
              const hidden = isCompleted ? allItems.length - visible.length : 0;
              return (
                <div key={group}>
                  <div style={{ padding: '8px 14px 4px', color: '#334155', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{group}</span>
                    {isCompleted && allItems.length > COMPLETED_CAP && (
                      <button
                        onClick={() => setShowAllCompleted(v => !v)}
                        style={{ background: 'none', border: 'none', color: '#475569', fontSize: '10px', cursor: 'pointer', padding: 0 }}
                      >
                        {showAllCompleted ? 'collapse' : `+${hidden} more`}
                      </button>
                    )}
                  </div>
                  {visible.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      active={s.id === activeSessionId}
                      onSelect={() => void selectSession(s.id)}
                      onEnd={(e) => void endSession(e, s.id)}
                    />
                  ))}
                </div>
              );
            })}

            {sessions.length === 0 && (
              <div style={{ padding: '24px 14px', color: '#334155', fontSize: '12px', textAlign: 'center' }}>
                No sessions yet.<br />Click + to create one.
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function SearchResultRow({
  result, active, onSelect,
}: {
  result: SessionSearchResult;
  active: boolean;
  onSelect(): void;
}) {
  const { session, matches } = result;
  const icon = STATUS_ICONS[session.status] ?? '○';
  const iconColor = STATUS_COLORS[session.status] ?? '#64748b';
  const topDomain = matches.topNodeDomains[0]?.domain ?? '';

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '7px 14px',
        cursor: 'pointer',
        background: active ? '#0c1a2e' : 'transparent',
        borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: iconColor, fontSize: '10px', flexShrink: 0 }}>{icon}</span>
        <span style={{ color: active ? '#f1f5f9' : '#94a3b8', fontSize: '12px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.name}
        </span>
      </div>
      <div style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace', paddingLeft: '16px' }}>
        {matches.failedNodeCount > 0 && (
          <span style={{ color: '#ef4444', marginRight: 6 }}>{matches.failedNodeCount} failed</span>
        )}
        {topDomain && <span style={{ color: '#334155' }}>{topDomain}</span>}
        {matches.matchedTags.length > 0 && (
          <span style={{ color: '#475569', marginLeft: 4 }}>[{matches.matchedTags.slice(0, 2).join(', ')}]</span>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session, active, onSelect, onEnd,
}: {
  session: ApiSession;
  active: boolean;
  onSelect(): void;
  onEnd(e: React.MouseEvent): void;
}) {
  const icon = STATUS_ICONS[session.status] ?? '○';
  const iconColor = STATUS_COLORS[session.status] ?? '#64748b';

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 14px',
        cursor: 'pointer',
        background: active ? '#0c1a2e' : 'transparent',
        borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
        borderRight: 'none',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ color: iconColor, fontSize: '10px', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: active ? '#f1f5f9' : '#94a3b8', fontSize: '12px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.name}
        </div>
        <div style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace' }}>
          {session.eventCount}e · {session.nodeCount}n · {timeAgo(session.startedAt)}
        </div>
      </div>
      {session.status === 'ACTIVE' && (
        <button
          onClick={onEnd}
          title="Stop session"
          style={{ color: '#475569', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 2px', flexShrink: 0 }}
        >
          ■
        </button>
      )}
    </div>
  );
}

