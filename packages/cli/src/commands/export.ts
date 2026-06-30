import type { ObserverClient } from '../client.js';

export async function exportSession(
  client: ObserverClient,
  sessionId: string,
  format: 'json' | 'markdown' = 'json',
): Promise<void> {
  const res = await fetch(
    `${(client as unknown as { config: { url: string } }).config.url}/api/sessions/${sessionId}/export?format=${format}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  process.stdout.write(text);
}
