import { useState } from 'react';
import { Header } from './components/Header.js';
import { SessionBrowser } from './components/SessionBrowser.js';
import { GraphView } from './components/GraphView.js';
import { Inspector } from './components/Inspector.js';
import { Timeline } from './components/Timeline.js';
import { AlertPanel } from './components/AlertPanel.js';
import { PerformanceView } from './components/PerformanceView.js';
import { CompareView } from './components/CompareView.js';
import { useStore } from './store/index.js';

type RightPanel = 'inspector' | 'alerts' | 'performance' | 'ask' | 'compare';

function AskView() {
  const { activeSessionId } = useStore();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ answer?: string; error?: string; hint?: string } | null>(null);

  const ask = async () => {
    if (!activeSessionId || !question.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`http://localhost:4000/api/sessions/${activeSessionId}/query?stream=true`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (res.status === 503) {
        const data = await res.json() as { hint?: string };
        setResult({ error: 'AI_UNAVAILABLE', hint: data.hint });
        return;
      }

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let answer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const msg = JSON.parse(line.slice(6)) as { type: string; text?: string };
              if (msg.type === 'chunk' && msg.text) {
                answer += msg.text;
                setResult({ answer });
              }
            } catch { /* ignore */ }
          }
        }
      } else {
        const data = await res.json() as { answer?: string };
        setResult({ answer: data.answer });
      }
    } catch {
      setResult({ error: 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }}
          placeholder="why did this fail?"
          disabled={!activeSessionId || loading}
          style={{
            flex: 1,
            background: '#0a1628',
            border: '1px solid #1e293b',
            borderRadius: 4,
            color: '#e2e8f0',
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={() => void ask()}
          disabled={!question.trim() || loading}
          style={{
            background: '#1d4ed8',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'monospace',
            opacity: question.trim() ? 1 : 0.5,
          }}
        >
          {loading ? '…' : 'ask'}
        </button>
      </div>

      {loading && result?.answer && (
        <div style={{ color: '#475569', fontSize: 9, fontFamily: 'monospace' }}>streaming…</div>
      )}

      {result?.error === 'AI_UNAVAILABLE' && (
        <div style={{ color: '#f59e0b', fontSize: 10, fontFamily: 'monospace' }}>
          {result.hint ?? 'Set ANTHROPIC_API_KEY to enable AI answers'}
        </div>
      )}
      {result?.error && result.error !== 'AI_UNAVAILABLE' && (
        <div style={{ color: '#ef4444', fontSize: 10, fontFamily: 'monospace' }}>{result.error}</div>
      )}
      {result?.answer && (
        <div style={{
          background: '#0a1628',
          border: '1px solid #1e293b',
          borderRadius: 6,
          padding: 10,
          fontSize: 11,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          overflowY: 'auto',
          flex: 1,
        }}>
          {result.answer}
        </div>
      )}
    </div>
  );
}

export function App() {
  const [rightPanel, setRightPanel] = useState<RightPanel>('inspector');

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#060e1a',
      color: '#f1f5f9',
      overflow: 'hidden',
    }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <SessionBrowser />
        <GraphView />
        <div style={{ display: 'flex', flexDirection: 'column', width: '280px', minWidth: '220px', borderLeft: '1px solid #1e293b' }}>
          {/* Panel switcher tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
            {(['inspector', 'alerts', 'performance', 'ask', 'compare'] as RightPanel[]).map((p) => (
              <button key={p} onClick={() => setRightPanel(p)} style={{
                flex: 1,
                background: rightPanel === p ? '#0f172a' : 'transparent',
                border: 'none',
                borderBottom: rightPanel === p ? '2px solid #3b82f6' : '2px solid transparent',
                color: rightPanel === p ? '#e2e8f0' : '#475569',
                padding: '8px 2px',
                cursor: 'pointer',
                fontSize: '10px',
                fontFamily: 'monospace',
              }}>
                {p}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {rightPanel === 'inspector' && <Inspector />}
            {rightPanel === 'alerts' && <AlertPanel />}
            {rightPanel === 'performance' && <PerformanceView />}
            {rightPanel === 'ask' && <AskView />}
            {rightPanel === 'compare' && <CompareView />}
          </div>
        </div>
      </div>
      <Timeline />
    </div>
  );
}
