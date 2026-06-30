import type { DaemonClient } from '../client.js';

export async function getContext(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const id = String(args['session_id'] ?? '');
  const nodeId = String(args['node_id'] ?? '');
  if (!id) return 'Error: session_id required';
  if (!nodeId) return 'Error: node_id required — use observer_get_nodes first to find a node ID';

  const depth = String(args['depth'] ?? 'DETAILED') as 'SURFACE' | 'DETAILED' | 'FULL';

  const pkg = await client.post<{ markdownContent?: string; tokenEstimate?: number }>(
    `/api/sessions/${id}/context`,
    {
      anchor: { type: 'node', nodeId },
      depth,
      format: 'MARKDOWN',
    },
  );
  return pkg.markdownContent ?? JSON.stringify(pkg, null, 2);
}

export async function querySession(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const id = String(args['session_id'] ?? '');
  const question = String(args['question'] ?? '');
  if (!id) return 'Error: session_id required';
  if (!question) return 'Error: question required';

  const anchorNodeId = args['anchor_node_id'] ? String(args['anchor_node_id']) : undefined;
  const depth = String(args['depth'] ?? 'DETAILED');

  const result = await client.post<{ answer?: string; error?: string; hint?: string }>(
    `/api/sessions/${id}/query`,
    { question, anchorNodeId, depth },
  );

  if (result.error === 'AI_UNAVAILABLE') {
    return `AI unavailable: ${result.hint ?? 'Set ANTHROPIC_API_KEY on the Observer daemon'}`;
  }
  return result.answer ?? JSON.stringify(result, null, 2);
}
