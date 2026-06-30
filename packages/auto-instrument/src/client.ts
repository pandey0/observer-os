import * as http from 'http';
import * as https from 'https';

export interface EmitPayload {
  type: string;
  sourceNodeId: string;
  occurredAt: number;
  severity?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

export function postEvent(daemonUrl: string, sessionId: string, event: EmitPayload, apiKey?: string): void {
  // Fire-and-forget — no await, no error handling that blocks user code
  const body = JSON.stringify({
    ...event,
    payload: event.payload ?? {},
  });

  const url = new URL(`/api/sessions/${sessionId}/events`, daemonUrl);
  const lib = url.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body).toString(),
  };
  if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;

  const req = lib.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers,
  });
  req.on('error', () => {}); // silently ignore — never block user app
  req.write(body);
  req.end();
}

// Returns a Promise — use in SIGTERM/SIGINT handlers (event loop still alive)
export function closeSession(daemonUrl: string, sessionId: string, apiKey?: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const url = new URL(`/api/sessions/${sessionId}`, daemonUrl);
      const lib = url.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {};
      if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
      const req = lib.request(
        { hostname: url.hostname, port: url.port, path: url.pathname, method: 'DELETE', headers },
        (res) => { res.resume(); res.on('end', resolve); }
      );
      req.on('error', resolve); // resolve on error — never block shutdown
      req.setTimeout(2000, () => { req.destroy(); resolve(); });
      req.end();
    } catch { resolve(); }
  });
}

// Always creates a NEW session so each app start gets a fresh graph.
// Set OBSERVER_SESSION_REUSE=1 to reuse the most recent active session instead.
export function getDefaultSession(daemonUrl: string, apiKey?: string): Promise<{ id: string }> {
  if (process.env['OBSERVER_SESSION_REUSE'] === '1') {
    return _getExistingSession(daemonUrl, apiKey);
  }
  return _createSession(daemonUrl, apiKey);
}

async function _closeOrphanedSessions(daemonUrl: string, apiKey?: string): Promise<void> {
  // Close any ACTIVE sessions that look like previous runs of this same app.
  // Handles the case where the process was killed before the shutdown handler ran.
  const entrypoint = process.env['npm_package_name'] ?? process.argv[1]?.split('/').pop() ?? 'app';
  return new Promise((resolve) => {
    const url = new URL('/api/sessions', daemonUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const headers: Record<string, string> = {};
    if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
    const req = lib.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c.toString(); });
      res.on('end', () => {
        try {
          const sessions = JSON.parse(data) as Array<{ id: string; status: string; name?: string }>;
          // Match any auto-instrument session regardless of entrypoint name.
          // Pattern: "<name> — pid <number>" — always created by this hook.
          const autoInstrumentPattern = / — pid \d+$/;
          const orphans = sessions.filter(
            s => s.status === 'ACTIVE' && s.name != null && autoInstrumentPattern.test(s.name)
          );
          // Fire-and-forget DELETE for each orphaned session
          for (const s of orphans) {
            closeSession(daemonUrl, s.id, apiKey).catch(() => {});
          }
        } catch { /* ignore */ }
        resolve();
      });
    });
    req.on('error', resolve);
    req.setTimeout(2000, () => { req.destroy(); resolve(); });
    req.end();
  });
}

function _createSession(daemonUrl: string, apiKey?: string): Promise<{ id: string }> {
  return _closeOrphanedSessions(daemonUrl, apiKey).then(() => new Promise((resolve, reject) => {
    const url = new URL('/api/sessions', daemonUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({
      name: `${process.env['npm_package_name'] ?? process.argv[1]?.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'app'} — pid ${process.pid}`,
      tags: ['auto-instrument'],
    });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body).toString(),
    };
    if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;

    const req = lib.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data) as { id: string }); }
            catch { reject(new Error('Invalid JSON from daemon')); }
          } else {
            reject(new Error(`Daemon returned ${res.statusCode ?? 'unknown'}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  }));
}

function _getExistingSession(daemonUrl: string, apiKey?: string): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/sessions/default', daemonUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const headers: Record<string, string> = {};
    if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;

    const req = lib.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data) as { id: string }); }
            catch { reject(new Error('Invalid JSON from daemon')); }
          } else {
            reject(new Error(`Daemon returned ${res.statusCode ?? 'unknown'}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}
