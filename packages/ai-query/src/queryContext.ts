import Anthropic from '@anthropic-ai/sdk';
import type { ContextPackage } from '@observer-os/context-engine';
import type { QueryOptions, QueryResult } from './types.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 1024;
const TOKEN_THRESHOLD = 6000;
const CHAR_TRUNCATE_LIMIT = 24000;

export async function queryContext(
  pkg: ContextPackage,
  question: string,
  opts?: QueryOptions,
): Promise<QueryResult> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const model = opts?.model ?? DEFAULT_MODEL;
  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Truncate content if too large
  let content = pkg.markdownContent;
  if (pkg.tokenEstimate > TOKEN_THRESHOLD) {
    if (content.length > CHAR_TRUNCATE_LIMIT) {
      const truncateAt = content.lastIndexOf('\n', CHAR_TRUNCATE_LIMIT);
      const cutPoint = truncateAt > 0 ? truncateAt : CHAR_TRUNCATE_LIMIT;
      content = content.slice(0, cutPoint) + '\n\n[Context truncated]';
    }
  }

  const systemPrompt =
    'You are an Observer OS runtime diagnostics assistant. Answer only from the provided context. If the answer is not determinable from context, say so.';
  const userMessage = `Context:\n${content}\n\nQuestion: ${question}`;

  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const firstBlock = response.content[0];
  const answer = firstBlock?.type === 'text' ? firstBlock.text : '';

  return {
    answer,
    model: response.model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}
