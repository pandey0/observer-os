import type { McpConfig } from './config.js';

export class DaemonClient {
  constructor(readonly config: McpConfig) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.apiKey) h['authorization'] = `Bearer ${this.config.apiKey}`;
    return h;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.observerUrl}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Daemon error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.config.observerUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Daemon error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
}
