import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/index.js';

interface AlertFire {
  ruleId: string;
  ruleName: string;
  sessionId: string;
  nodeId: string | null;
  eventType: string | null;
  detail: Record<string, unknown>;
  firedAt: number;
}

interface AlertRule {
  id: string;
  name: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
}

const DAEMON = 'http://localhost:4000';

const pill = (label: string, color: string) => (
  <span style={{
    background: color + '22', color, border: `1px solid ${color}44`,
    borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontFamily: 'monospace',
  }}>{label}</span>
);

export function AlertPanel() {
  const { activeSessionId } = useStore();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [fires, setFires] = useState<AlertFire[]>([]);
  const [tab, setTab] = useState<'fires' | 'rules' | 'new'>('fires');
  const [newRule, setNewRule] = useState({
    name: '',
    conditionType: 'node.status',
    conditionStatus: 'FAILED',
    conditionSeverity: 'ERROR',
    conditionMs: '500',
    actionType: 'log',
    webhookUrl: '',
  });

  const reload = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([
        fetch(`${DAEMON}/api/alerts`).then((r) => r.json()),
        fetch(`${DAEMON}/api/alerts/fires`).then((r) => r.json()),
      ]);
      setRules((r as { rules: AlertRule[] }).rules ?? []);
      setFires((f as { fires: AlertFire[] }).fires ?? []);
    } catch { /* daemon not up yet */ }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [reload]);

  const removeRule = async (id: string) => {
    await fetch(`${DAEMON}/api/alerts/${id}`, { method: 'DELETE' });
    void reload();
  };

  const toggleRule = async (rule: AlertRule) => {
    await fetch(`${DAEMON}/api/alerts/${rule.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    void reload();
  };

  const createRule = async () => {
    let condition: Record<string, unknown>;
    if (newRule.conditionType === 'node.status') {
      condition = { type: 'node.status', status: newRule.conditionStatus };
    } else if (newRule.conditionType === 'event.severity') {
      condition = { type: 'event.severity', severity: newRule.conditionSeverity };
    } else {
      condition = { type: 'query.duration', thresholdMs: Number(newRule.conditionMs) };
    }

    const action: Record<string, unknown> =
      newRule.actionType === 'webhook'
        ? { type: 'webhook', url: newRule.webhookUrl }
        : { type: 'log' };

    await fetch(`${DAEMON}/api/alerts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newRule.name, condition, action, enabled: true }),
    });
    setTab('rules');
    void reload();
  };

  const handleExport = async (fmt: 'json' | 'markdown') => {
    if (!activeSessionId) return;
    const url = `${DAEMON}/api/sessions/${activeSessionId}/export?format=${fmt}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${activeSessionId}.${fmt === 'markdown' ? 'md' : 'json'}`;
    a.click();
  };

  const s = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#060e1a' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
        {(['fires', 'rules', 'new'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1e293b' : 'transparent',
            border: '1px solid ' + (tab === t ? '#334155' : 'transparent'),
            borderRadius: '4px', color: tab === t ? '#e2e8f0' : '#475569',
            padding: '3px 10px', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace',
          }}>
            {t === 'fires' ? `fires (${fires.length})` : t === 'rules' ? `rules (${rules.length})` : '+ new'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {activeSessionId && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => void handleExport('markdown')} style={exportBtn}>↓ .md</button>
            <button onClick={() => void handleExport('json')} style={exportBtn}>↓ .json</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>

        {tab === 'fires' && (
          fires.length === 0
            ? <Empty text="no alert fires yet" />
            : fires.map((f, i) => (
                <div key={i} style={fireCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    {pill(f.ruleName, '#f59e0b')}
                    <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace' }}>
                      {new Date(f.firedAt).toISOString().slice(11, 23)}
                    </span>
                  </div>
                  {Object.entries(f.detail).map(([k, v]) => (
                    <div key={k} style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                      {k}: {s(v)}
                    </div>
                  ))}
                </div>
              ))
        )}

        {tab === 'rules' && (
          rules.length === 0
            ? <Empty text="no rules configured" />
            : rules.map((r) => (
                <div key={r.id} style={ruleCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#e2e8f0', fontSize: '12px', fontFamily: 'monospace' }}>{r.name}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => void toggleRule(r)} style={smallBtn}>{r.enabled ? 'disable' : 'enable'}</button>
                      <button onClick={() => void removeRule(r.id)} style={{ ...smallBtn, color: '#ef4444' }}>del</button>
                    </div>
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                    {s(r.condition.type)} → {s(r.action.type)}
                  </div>
                </div>
              ))
        )}

        {tab === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Field label="name">
              <input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} style={inp} placeholder="e.g. Slow query alert" />
            </Field>
            <Field label="condition">
              <select value={newRule.conditionType} onChange={(e) => setNewRule({ ...newRule, conditionType: e.target.value })} style={inp}>
                <option value="node.status">node status</option>
                <option value="event.severity">event severity</option>
                <option value="query.duration">query duration</option>
              </select>
            </Field>
            {newRule.conditionType === 'node.status' && (
              <Field label="status">
                <select value={newRule.conditionStatus} onChange={(e) => setNewRule({ ...newRule, conditionStatus: e.target.value })} style={inp}>
                  <option value="FAILED">FAILED</option>
                  <option value="DEGRADED">DEGRADED</option>
                </select>
              </Field>
            )}
            {newRule.conditionType === 'event.severity' && (
              <Field label="min severity">
                <select value={newRule.conditionSeverity} onChange={(e) => setNewRule({ ...newRule, conditionSeverity: e.target.value })} style={inp}>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                  <option value="FATAL">FATAL</option>
                </select>
              </Field>
            )}
            {newRule.conditionType === 'query.duration' && (
              <Field label="threshold (ms)">
                <input type="number" value={newRule.conditionMs} onChange={(e) => setNewRule({ ...newRule, conditionMs: e.target.value })} style={inp} />
              </Field>
            )}
            <Field label="action">
              <select value={newRule.actionType} onChange={(e) => setNewRule({ ...newRule, actionType: e.target.value })} style={inp}>
                <option value="log">log</option>
                <option value="webhook">webhook</option>
              </select>
            </Field>
            {newRule.actionType === 'webhook' && (
              <Field label="webhook URL">
                <input value={newRule.webhookUrl} onChange={(e) => setNewRule({ ...newRule, webhookUrl: e.target.value })} style={inp} placeholder="https://..." />
              </Field>
            )}
            <button onClick={() => void createRule()} disabled={!newRule.name} style={{
              background: '#1d4ed8', border: 'none', borderRadius: '6px',
              color: '#fff', padding: '6px 14px', cursor: 'pointer',
              fontSize: '12px', fontFamily: 'monospace', marginTop: '4px',
              opacity: newRule.name ? 1 : 0.5,
            }}>
              create rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace', marginBottom: '3px' }}>{label}</div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: '#334155', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center', marginTop: '24px' }}>{text}</div>;
}

const fireCard: React.CSSProperties = {
  background: '#0a1628', border: '1px solid #1e293b', borderRadius: '6px',
  padding: '8px 10px', marginBottom: '6px',
};

const ruleCard: React.CSSProperties = {
  background: '#0a1628', border: '1px solid #1e293b', borderRadius: '6px',
  padding: '8px 10px', marginBottom: '6px',
};

const smallBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #1e293b', borderRadius: '4px',
  color: '#64748b', padding: '2px 8px', cursor: 'pointer',
  fontSize: '10px', fontFamily: 'monospace',
};

const exportBtn: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', borderRadius: '4px',
  color: '#60a5fa', padding: '2px 8px', cursor: 'pointer',
  fontSize: '10px', fontFamily: 'monospace',
};

const inp: React.CSSProperties = {
  background: '#0a1628', border: '1px solid #1e293b', borderRadius: '4px',
  color: '#e2e8f0', padding: '4px 8px', fontSize: '11px',
  fontFamily: 'monospace', width: '100%', boxSizing: 'border-box',
};
