import type { DaemonClient } from '../client.js';

export async function getPerformance(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const id = String(args['session_id'] ?? '');
  if (!id) return 'Error: session_id required';
  const report = await client.get<{ buckets?: unknown[]; slowest?: unknown[] }>(`/api/sessions/${id}/performance`);
  return JSON.stringify(report, null, 2);
}

export async function exportSession(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const id = String(args['session_id'] ?? '');
  const format = String(args['format'] ?? 'markdown');
  if (!id) return 'Error: session_id required';
  const { config } = client;
  const headers: Record<string, string> = {};
  if (config.apiKey) headers['authorization'] = `Bearer ${config.apiKey}`;
  const res = await fetch(`${config.observerUrl}/api/sessions/${id}/export?format=${format}`, { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return await res.text();
}
