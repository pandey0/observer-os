import type { DaemonClient } from '../client.js';

export async function listSessions(client: DaemonClient): Promise<string> {
  const sessions = await client.get<unknown[]>('/api/sessions');
  if (!Array.isArray(sessions) || sessions.length === 0) return 'No sessions found.';
  return JSON.stringify(sessions, null, 2);
}

export async function getSession(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const id = String(args['session_id'] ?? '');
  if (!id) return 'Error: session_id required';
  const session = await client.get<unknown>(`/api/sessions/${id}`);
  return JSON.stringify(session, null, 2);
}

export async function searchSessions(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const params = new URLSearchParams();
  for (const key of ['q', 'domain', 'status', 'tag', 'from', 'to']) {
    if (args[key]) params.set(key, String(args[key]));
  }
  const result = await client.get<{ total: number; results: unknown[] }>(`/api/sessions/search?${params.toString()}`);
  if (result.results.length === 0) return 'No sessions matched the search criteria.';
  return `Found ${result.total} session(s):\n${JSON.stringify(result.results, null, 2)}`;
}
