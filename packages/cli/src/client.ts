import { loadConfig } from './config.js';
import type { ObserverConfig } from './config.js';

export class ObserverClient {
  constructor(private readonly config: ObserverConfig) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.apiKey) h['authorization'] = `Bearer ${this.config.apiKey}`;
    return h;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.url}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.config.url}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.url}${path}`, { method: 'DELETE', headers: this.headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
}

export function createClient(overrides?: Partial<ObserverConfig>): ObserverClient {
  return new ObserverClient(loadConfig(overrides));
}
