import { useEffect } from 'react';
import { useStore } from '../store/index.js';
import { api } from '../api/client.js';

export function Header() {
  const { daemonStatus, setDaemonStatus, wsStatus, wsReconnectAttempt, activeSessionId, sessions } = useStore();

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        await api.health();
        if (alive) setDaemonStatus('online');
      } catch {
        if (alive) setDaemonStatus('offline');
      }
    };
    void check();
    const t = setInterval(check, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [setDaemonStatus]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const statusDot = {
    online: { color: '#22c55e', label: 'daemon online' },
    offline: { color: '#ef4444', label: 'daemon offline' },
    unknown: { color: '#64748b', label: 'connecting...' },
  }[daemonStatus];

  const wsDot = {
    connected:    { color: '#22c55e', label: 'live' },
    connecting:   { color: '#f59e0b', label: 'connecting' },
    disconnected: { color: '#64748b', label: 'no session' },
    reconnecting: { color: '#f59e0b', label: `reconnecting (${wsReconnectAttempt})…` },
  }[wsStatus];

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '0 20px',
        height: '48px',
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
        ◉ Observer OS
      </span>

      <span style={{ color: '#1e293b', fontSize: '20px' }}>│</span>

      {/* Active session badge */}
      {activeSession ? (
        <span style={{
          padding: '2px 10px',
          borderRadius: '6px',
          background: '#0c1a2e',
          border: '1px solid #1e3a5f',
          color: '#60a5fa',
          fontSize: '12px',
          fontFamily: 'monospace',
        }}>
          {activeSession.name}
        </span>
      ) : (
        <span style={{ color: '#475569', fontSize: '12px' }}>no session selected</span>
      )}

      <div style={{ flex: 1 }} />

      {/* WS status */}
      <StatusPill dot={wsDot.color} label={wsDot.label} />

      {/* Daemon status */}
      <StatusPill dot={statusDot.color} label={statusDot.label} />
    </header>
  );
}

function StatusPill({ dot, label }: { dot: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%',
        background: dot, display: 'inline-block',
        boxShadow: `0 0 6px ${dot}`,
      }} />
      <span style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>{label}</span>
    </div>
  );
}
