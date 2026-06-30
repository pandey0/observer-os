import type { RuntimeEvent, EmitInput, NodeId, SessionId } from '@observer-os/core';
import { stableNodeId } from '@observer-os/core';
import type { SessionEngine } from '@observer-os/core';
import type { ObserverSDK, SessionInfo, PluginConfig, LogLevel, PluginLogEntry } from '../types/plugin.js';

export type LogHandler = (entry: PluginLogEntry) => void;

export class PluginSDKImpl implements ObserverSDK {
  private connected = false;
  private readonly logHandlers = new Set<LogHandler>();

  constructor(
    private readonly sessionEngine: SessionEngine,
    private readonly sessionInfo: SessionInfo,
    private readonly pluginId: string,
    private readonly config: PluginConfig,
  ) {}

  emit(input: EmitInput): RuntimeEvent {
    this.assertConnected();
    return this.sessionEngine.emit(this.sessionInfo.id as SessionId, input);
  }

  emitBatch(inputs: readonly EmitInput[]): RuntimeEvent[] {
    this.assertConnected();
    return inputs.map(input =>
      this.sessionEngine.emit(this.sessionInfo.id as SessionId, input)
    );
  }

  generateNodeId(stableKey: string): NodeId {
    return stableNodeId(this.pluginId, stableKey);
  }

  log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const entry: PluginLogEntry = {
      level,
      pluginId: this.pluginId,
      message,
      timestamp: Date.now(),
      metadata,
    };
    for (const handler of this.logHandlers) {
      try { handler(entry); } catch { /* log handlers must not crash SDK */ }
    }
    // Default: stderr for warn/error, silent for debug/info
    if (level === 'warn' || level === 'error') {
      process.stderr.write(`[observer-sdk:${this.pluginId}] ${level.toUpperCase()}: ${message}\n`);
    }
  }

  getConfig<T extends PluginConfig = PluginConfig>(): T {
    return this.config as T;
  }

  getSession(): SessionInfo {
    return this.sessionInfo;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Called by PluginRegistry after plugin.connect() resolves. */
  markConnected(): void {
    this.connected = true;
  }

  /** Called by PluginRegistry after plugin.disconnect() resolves. */
  markDisconnected(): void {
    this.connected = false;
  }

  /**
   * Connect to a specific session by ID (client-side zero-config use).
   * Marks this SDK instance as connected.
   */
  async connect(_sessionId: SessionId): Promise<void> {
    this.markConnected();
  }

  /**
   * Zero-config connect: fetches GET /api/sessions/default from the daemon,
   * which auto-creates a session if none is active, then calls connect().
   * daemonUrl defaults to config.daemonUrl or 'http://localhost:4000'.
   */
  async connectToDefault(daemonUrl?: string): Promise<void> {
    const url = daemonUrl
      ?? (this.config as { daemonUrl?: string }).daemonUrl
      ?? 'http://localhost:4000';

    let sessionId: string;
    try {
      const res = await fetch(`${url}/api/sessions/default`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const session = await res.json() as { id: string };
      sessionId = session.id;
    } catch (err) {
      throw new Error(`Observer: cannot reach daemon at ${url}: ${String(err)}`);
    }

    await this.connect(sessionId as SessionId);
  }

  /** Register a log handler (used by PluginRegistry for structured log collection). */
  onLog(handler: LogHandler): () => void {
    this.logHandlers.add(handler);
    return () => this.logHandlers.delete(handler);
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error(`[${this.pluginId}] SDK not connected — call connect() first`);
    }
  }
}
