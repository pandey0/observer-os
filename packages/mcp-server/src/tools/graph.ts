import type { DaemonClient } from '../client.js';

export async function getNodes(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const id = String(args['session_id'] ?? '');
  if (!id) return 'Error: session_id required';
  const result = await client.get<{ total: number; nodes: unknown[] }>(`/api/sessions/${id}/nodes`);
  return `${result.total} nodes in session:\n${JSON.stringify(result.nodes, null, 2)}`;
}

export async function getEvents(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const id = String(args['session_id'] ?? '');
  if (!id) return 'Error: session_id required';
  const limit = args['limit'] ? `?limit=${String(args['limit'])}` : '?limit=100';
  const after = args['after_sequence'] ? `&afterSequence=${String(args['after_sequence'])}` : '';
  const result = await client.get<{ total: number; events: unknown[] }>(`/api/sessions/${id}/events${limit}${after}`);
  return `${result.total} events (showing up to ${String(args['limit'] ?? 100)}):\n${JSON.stringify(result.events, null, 2)}`;
}
