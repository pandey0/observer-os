export interface DaemonConfig {
  url: string;
  apiKey?: string;
}

export interface ApiSession {
  id: string;
  name?: string;
  status: string;
  nodeCount: number;
  eventCount: number;
  startedAt: number;
  tags?: string[];
}

export interface ApiNode {
  id: string;
  type: string;
  domain: string;
  status: string;
  createdAt: number;
}

export interface ContextPackage {
  markdownContent: string;
  tokenEstimate: number;
}

export class DaemonClient {
  constructor(private config: DaemonConfig) {}

  updateConfig(config: DaemonConfig): void {
    this.config = config;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.apiKey) h['authorization'] = `Bearer ${this.config.apiKey}`;
    return h;
  }

  async isAlive(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.url}/api/health`, { headers: this.headers(), signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch { return false; }
  }

  async listSessions(): Promise<ApiSession[]> {
    const res = await fetch(`${this.config.url}/api/sessions`, { headers: this.headers(), signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ApiSession[]>;
  }

  async createSession(name?: string): Promise<ApiSession> {
    const res = await fetch(`${this.config.url}/api/sessions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ApiSession>;
  }

  async getNodes(sessionId: string): Promise<ApiNode[]> {
    const res = await fetch(`${this.config.url}/api/sessions/${sessionId}/nodes`, { headers: this.headers(), signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { nodes: ApiNode[] };
    return data.nodes;
  }

  async getContext(sessionId: string, nodeId: string, depth = 'DETAILED'): Promise<ContextPackage> {
    const res = await fetch(`${this.config.url}/api/sessions/${sessionId}/context`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ anchor: { type: 'node', nodeId }, depth, format: 'MARKDOWN' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ContextPackage>;
  }
}
