import type { DaemonClient } from '../client.js';

interface RawEvent {
  id: string;
  type: string;
  sourceNodeId: string;
  occurredAt: number;
  severity: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
  sequenceNumber: number;
}

interface EventsResponse {
  total: number;
  events: RawEvent[];
}

/**
 * Reconstruct a full request chain: HTTP in → body → SQL queries + params →
 * console logs → HTTP out (with response body + status).
 * Returned as a readable markdown report the agent can reason about.
 */
export async function debugRequest(
  client: DaemonClient,
  args: Record<string, unknown>,
): Promise<string> {
  const sessionId = String(args['session_id'] ?? '');
  if (!sessionId) return 'Error: session_id required';

  // Events flow: app → queue (setImmediate) → postEvent (HTTP) → daemon → DB.
  // Wait 1.5s so in-flight events from the most recent request have time to settle.
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Fetch up to 500 events
  const { events } = await client.get<EventsResponse>(
    `/api/sessions/${sessionId}/events?limit=500`,
  );

  // Group events by correlationId
  const byCorrelation = new Map<string, RawEvent[]>();
  const uncorrelated: RawEvent[] = [];

  for (const e of events) {
    if (e.correlationId) {
      const arr = byCorrelation.get(e.correlationId) ?? [];
      arr.push(e);
      byCorrelation.set(e.correlationId, arr);
    } else {
      uncorrelated.push(e);
    }
  }

  // If a specific correlationId is given, focus on that
  const focusCid = args['correlation_id'] ? String(args['correlation_id']) : null;

  // Find HTTP request chains (has request.started event)
  const chains: Array<{ cid: string; events: RawEvent[] }> = [];
  for (const [cid, evs] of byCorrelation.entries()) {
    if (focusCid && cid !== focusCid) continue;
    const hasHttp = evs.some(e => e.type.includes('http-server/request'));
    if (hasHttp) chains.push({ cid, events: evs.sort((a, b) => a.occurredAt - b.occurredAt) });
  }

  if (chains.length === 0) {
    return focusCid
      ? `No HTTP request chain found for correlationId ${focusCid}`
      : 'No HTTP request chains found in this session. Make some requests first.';
  }

  // Limit to most recent 10 chains unless focused
  const toReport = focusCid ? chains : chains.slice(-10);

  const lines: string[] = [];
  lines.push(`# Request Debug Report`);
  lines.push(`Session: ${sessionId}`);
  lines.push(`Chains found: ${chains.length} (showing ${toReport.length})`);
  lines.push('');

  for (const chain of toReport) {
    const { cid, events: evs } = chain;

    // Find start/end
    const startEv = evs.find(e => e.type.includes('request.started'));
    const bodyEv = evs.find(e => e.type.includes('request.body'));
    const endEv = evs.find(e =>
      e.type.includes('request.completed') || e.type.includes('request.failed'),
    );
    const sqlEvs = evs.filter(e => e.type.includes('postgres/query') || e.type.includes('mysql/query'));
    const redisEvs = evs.filter(e => e.type.includes('redis/command'));
    const consoleEvs = evs.filter(e => e.type.includes('console/'));
    const failedSql = sqlEvs.filter(e => e.type.includes('query.failed'));

    const method = String(startEv?.payload?.['method'] ?? '?');
    const url = String(startEv?.payload?.['url'] ?? '?');
    const status = endEv?.payload?.['status'];
    const durationMs = endEv?.payload?.['durationMs'];
    const contentType = String(startEv?.payload?.['contentType'] ?? '');

    lines.push(`---`);
    lines.push(`## ${method} ${url}`);
    lines.push(`CorrelationId: \`${cid}\``);
    lines.push(`Status: ${status ?? '?'} | Duration: ${durationMs != null ? `${durationMs}ms` : '?'}`);
    lines.push(`Content-Type: ${contentType || '(none)'}`);
    lines.push('');

    // Request body
    if (bodyEv?.payload?.['body'] != null) {
      lines.push('### Request Body');
      const body = bodyEv.payload['body'];
      if (typeof body === 'object') {
        lines.push('```json');
        lines.push(JSON.stringify(body, null, 2));
        lines.push('```');
      } else {
        lines.push('```');
        lines.push(String(body));
        lines.push('```');
      }
      lines.push('');
    } else if (method !== 'GET' && method !== 'DELETE') {
      lines.push('### Request Body');
      lines.push('_(no body captured — GET/HEAD/DELETE or non-JSON content-type)_');
      lines.push('');
    }

    // Response body
    const resBody = endEv?.payload?.['responseBody'];
    if (resBody != null) {
      lines.push('### Response Body');
      if (typeof resBody === 'object') {
        lines.push('```json');
        lines.push(JSON.stringify(resBody, null, 2));
        lines.push('```');
      } else {
        lines.push('```');
        lines.push(String(resBody).slice(0, 1000));
        lines.push('```');
      }
      lines.push('');
    }

    // SQL queries
    if (sqlEvs.length > 0) {
      const startedSql = sqlEvs.filter(e => e.type.includes('query.started'));
      const completions = sqlEvs.filter(e =>
        e.type.includes('query.completed') || e.type.includes('query.failed'),
      );
      lines.push(`### SQL Queries (${startedSql.length} executed)`);

      // Match each started event to its nearest subsequent completion, in order
      const usedCompletions = new Set<string>();
      for (const ev of startedSql) {
        const q = String(ev.payload?.['query'] ?? '');
        const params = ev.payload?.['params'];
        const completedEv = completions.find(
          c => !usedCompletions.has(c.id) && c.occurredAt >= ev.occurredAt,
        );
        if (completedEv) usedCompletions.add(completedEv.id);
        const duration = completedEv?.payload?.['durationMs'];
        const failed = completedEv?.type.includes('query.failed') ?? false;
        const errorMsg = completedEv?.payload?.['errorMessage'];

        lines.push(`\n**${failed ? '❌ FAILED' : '✓'} Query** ${duration != null ? `(${duration}ms)` : ''}`);
        lines.push('```sql');
        lines.push(q);
        lines.push('```');
        if (params && Array.isArray(params) && params.length > 0) {
          lines.push(`Params: \`${JSON.stringify(params)}\``);
        }
        if (failed && errorMsg) {
          lines.push(`**Error:** \`${errorMsg}\``);
        }
      }
      lines.push('');
    }

    // Redis commands
    if (redisEvs.length > 0) {
      const started = redisEvs.filter(e => e.type.includes('command.started'));
      lines.push(`### Redis Commands (${started.length})`);
      for (const ev of started) {
        const cmd = String(ev.payload?.['command'] ?? '?');
        const completedEv = redisEvs.find(
          c =>
            (c.type.includes('command.completed') || c.type.includes('command.failed')) &&
            c.occurredAt >= ev.occurredAt,
        );
        const duration = completedEv?.payload?.['durationMs'];
        const failed = completedEv?.type.includes('command.failed');
        lines.push(`- ${failed ? '❌' : '✓'} \`${cmd}\`${duration != null ? ` (${duration}ms)` : ''}`);
      }
      lines.push('');
    }

    // Console output
    if (consoleEvs.length > 0) {
      lines.push(`### Console Output (${consoleEvs.length} lines)`);
      lines.push('```');
      for (const ev of consoleEvs) {
        const lvl = ev.type.split('/').pop()?.toUpperCase() ?? 'LOG';
        lines.push(`[${lvl}] ${String(ev.payload?.['message'] ?? '')}`);
      }
      lines.push('```');
      lines.push('');
    }

    // Anomalies
    const anomalies: string[] = [];
    if (failedSql.length > 0) {
      for (const f of failedSql) {
        anomalies.push(`SQL error: ${String(f.payload?.['errorMessage'] ?? 'unknown')}`);
      }
    }
    if (status != null && Number(status) >= 400) {
      anomalies.push(`HTTP ${status} response`);
    }
    if (durationMs != null && Number(durationMs) > 1000) {
      anomalies.push(`Slow request: ${durationMs}ms > 1000ms threshold`);
    }
    const sqlCount = sqlEvs.filter(e => e.type.includes('.started')).length;
    if (sqlCount > 5) {
      anomalies.push(`High query count: ${sqlCount} SQL queries for one request (possible N+1)`);
    }

    if (anomalies.length > 0) {
      lines.push('### ⚠ Anomalies Detected');
      for (const a of anomalies) lines.push(`- ${a}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
