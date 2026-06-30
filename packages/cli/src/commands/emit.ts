import type { ObserverClient } from '../client.js';
import { formatJson } from '../format.js';

export async function emitEvent(
  client: ObserverClient,
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
  json = false,
): Promise<void> {
  const body = {
    type,
    sourceNodeId: 'cli',
    occurredAt: Date.now(),
    payload,
  };

  const res = await client.post<{ id: string; sequenceNumber: number }>(
    `/api/sessions/${sessionId}/events`,
    body,
  );

  if (json) {
    process.stdout.write(formatJson(res) + '\n');
    return;
  }
  process.stdout.write(`Event emitted: ${res.id} (seq: ${res.sequenceNumber})\n`);
}
