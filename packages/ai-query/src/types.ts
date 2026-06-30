export interface QueryOptions {
  model?: string;     // default: 'claude-haiku-4-5-20251001'
  maxTokens?: number; // default: 1024
}

export interface QueryResult {
  answer: string;
  model: string;
  tokensUsed: number;
}
