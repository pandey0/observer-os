import type { ObserverClient } from '../client.js';
import { formatTable, formatJson } from '../format.js';

export interface ApiSession {
  id: string;
  name: string;
  workspaceId: string;
  status: string;
  startedAt: number;
  endedAt?: number;
  tags: readonly string[];
  eventCount: number;
  nodeCount: number;
}

const SESSION_COLUMNS = ['id', 'name', 'status', 'eventCount', 'nodeCount', 'tags'];

function printSessions(sessions: ApiSession[], json: boolean): void {
  if (json) {
    process.stdout.write(formatJson(sessions) + '\n');
    return;
  }
  const rows = sessions.map((s) => ({
    ...s,
    tags: (s.tags ?? []).join(', '),
  }));
  process.stdout.write(formatTable(rows, SESSION_COLUMNS) + '\n');
}

export async function listSessions(
  client: ObserverClient,
  json = false,
): Promise<void> {
  const sessions = await client.get<ApiSession[]>('/api/sessions');
  printSessions(sessions, json);
}

export async function searchSessions(
  client: ObserverClient,
  params: Record<string, string>,
  json = false,
): Promise<void> {
  const qs = new URLSearchParams(params).toString();
  const res = await client.get<{ total: number; results: ApiSession[] }>(
    `/api/sessions/search${qs ? `?${qs}` : ''}`,
  );
  if (json) {
    process.stdout.write(formatJson(res) + '\n');
    return;
  }
  process.stdout.write(`Found ${res.total} session(s)\n`);
  printSessions(res.results, false);
}

export async function createSession(
  client: ObserverClient,
  name?: string,
  tags?: string[],
  json = false,
): Promise<void> {
  const body: { name?: string; tags?: string[] } = {};
  if (name) body.name = name;
  if (tags && tags.length > 0) body.tags = tags;

  const session = await client.post<ApiSession>('/api/sessions', body);
  if (json) {
    process.stdout.write(formatJson(session) + '\n');
    return;
  }
  process.stdout.write(`Created session: ${session.id}\n`);
}

export async function deleteSession(
  client: ObserverClient,
  id: string,
  json = false,
): Promise<void> {
  const session = await client.delete<ApiSession>(`/api/sessions/${id}`);
  if (json) {
    process.stdout.write(formatJson(session) + '\n');
    return;
  }
  process.stdout.write(`Ended session: ${session.id} (status: ${session.status})\n`);
}
