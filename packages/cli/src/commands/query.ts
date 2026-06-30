import type { ObserverClient } from '../client.js';

export async function querySession(
  client: ObserverClient,
  sessionId: string,
  question: string,
): Promise<void> {
  const result = await client.post<{ answer?: string; error?: string; hint?: string }>(
    `/api/sessions/${sessionId}/query`,
    { question },
  );
  if (result.error === 'AI_UNAVAILABLE') {
    process.stderr.write(`AI unavailable: ${result.hint ?? 'Set ANTHROPIC_API_KEY'}\n`);
    process.exit(1);
  }
  process.stdout.write((result.answer ?? '') + '\n');
}
