export interface McpConfig {
  observerUrl: string;
  apiKey?: string;
}

export function loadConfig(): McpConfig {
  return {
    observerUrl: process.env['OBSERVER_URL'] ?? 'http://localhost:4000',
    apiKey: process.env['OBSERVER_API_KEY'],
  };
}
