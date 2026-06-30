import { useEffect, useState } from 'react';
import { useStore } from '../store/index.js';
import { api } from '../api/client.js';
import { BucketHistogram } from './BucketHistogram.js';
import { SlowestTable } from './SlowestTable.js';

export function PerformanceView() {
  const { activeSessionId, performanceReport, setPerformanceReport, nodes } = useStore();
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    if (!activeSessionId) return;

    const loadReport = async () => {
      const report = await api.sessions.performance(activeSessionId).catch(() => null);
      setPerformanceReport(report);
      if (report) setLastUpdated(Date.now());
    };

    void loadReport();
    const id = setInterval(loadReport, 15000);
    return () => clearInterval(id);
  }, [activeSessionId, setPerformanceReport]);

  const refresh = () => {
    if (!activeSessionId) return;
    api.sessions.performance(activeSessionId)
      .then((r) => { setPerformanceReport(r); setLastUpdated(Date.now()); })
      .catch(() => null);
  };

  const topBuckets = performanceReport
    ? [...performanceReport.buckets]
        .sort((a, b) => b.p95Ms - a.p95Ms)
        .slice(0, 8)
    : [];

  const maxP95 = topBuckets.reduce((m, b) => Math.max(m, b.p95Ms), 0);

  const updatedStr = lastUpdated
    ? new Date(lastUpdated).toISOString().slice(11, 19)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#060e1a', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
        <span style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>performance</span>
        {updatedStr && (
          <span style={{ color: '#334155', fontSize: 9, fontFamily: 'monospace', flex: 1 }}>
            {updatedStr}
          </span>
        )}
        <button
          onClick={refresh}
          disabled={!activeSessionId}
          title="Refresh"
          style={{
            background: 'transparent',
            border: '1px solid #1e293b',
            borderRadius: 4,
            color: '#475569',
            padding: '2px 6px',
            cursor: activeSessionId ? 'pointer' : 'default',
            fontSize: 10,
            fontFamily: 'monospace',
          }}
        >
          ↺
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {!performanceReport ? (
          <div style={{ color: '#334155', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', marginTop: 24 }}>
            {activeSessionId ? 'no performance data' : 'select a session'}
          </div>
        ) : (
          <>
            {/* Histogram */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#334155', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                p95 latency by event type
              </div>
              <BucketHistogram buckets={topBuckets} maxP95={maxP95} />
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid #1e293b', margin: '10px 0' }} />

            {/* Slowest table */}
            <div>
              <div style={{ color: '#334155', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                slowest buckets
              </div>
              <SlowestTable buckets={performanceReport.slowest} nodes={nodes} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
