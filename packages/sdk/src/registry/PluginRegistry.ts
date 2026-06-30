import type { SessionEngine, Session } from '@observer-os/core';
import type {
  ObserverPlugin,
  Workspace,
  PluginConfig,
  HealthStatus,
  SessionInfo,
  PluginLogEntry,
} from '../types/plugin.js';
import { PluginSDKImpl } from '../sdk/PluginSDKImpl.js';

export type PluginStatus =
  | 'REGISTERED'
  | 'DISCOVERED'
  | 'CONNECTED'
  | 'PAUSED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface PluginEntry {
  readonly plugin: ObserverPlugin;
  status: PluginStatus;
  sdk: PluginSDKImpl | null;
  config: PluginConfig;
  error?: Error;
  connectedAt?: number;
  disconnectedAt?: number;
}

export type PluginLogSubscriber = (entry: PluginLogEntry) => void;

export class PluginRegistry {
  private readonly plugins = new Map<string, PluginEntry>();
  private readonly logSubscribers = new Set<PluginLogSubscriber>();

  constructor(private readonly sessionEngine: SessionEngine) {}

  // ─── Registration ───────────────────────────────────────────────────────────

  register(plugin: ObserverPlugin, config: PluginConfig = {}): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, {
      plugin,
      status: 'REGISTERED',
      sdk: null,
      config,
    });
  }

  unregister(pluginId: string): void {
    const entry = this.require(pluginId);
    if (entry.status === 'CONNECTED') {
      throw new Error(`Cannot unregister connected plugin ${pluginId} — disconnect first`);
    }
    this.plugins.delete(pluginId);
  }

  // ─── Discovery ──────────────────────────────────────────────────────────────

  async discover(workspace: Workspace): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    await Promise.allSettled(
      Array.from(this.plugins.values()).map(async entry => {
        try {
          const result = await entry.plugin.discover(workspace);
          entry.status = result.detected ? 'DISCOVERED' : entry.status;
          results.set(entry.plugin.id, result.detected);
        } catch (err) {
          this.markError(entry, err);
          results.set(entry.plugin.id, false);
        }
      })
    );

    return results;
  }

  // ─── Connection ─────────────────────────────────────────────────────────────

  async connect(pluginId: string, session: Session): Promise<void> {
    const entry = this.require(pluginId);
    if (entry.status === 'CONNECTED') return;

    const sessionInfo: SessionInfo = {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name,
      startedAt: session.startedAt,
    };

    const sdk = new PluginSDKImpl(
      this.sessionEngine,
      sessionInfo,
      pluginId,
      entry.config,
    );

    // Wire log entries to registry subscribers
    sdk.onLog(entry => {
      for (const sub of this.logSubscribers) {
        try { sub(entry); } catch { /* never propagate */ }
      }
    });

    try {
      sdk.markConnected();
      await entry.plugin.connect(sessionInfo, sdk, entry.config);
      entry.sdk = sdk;
      entry.status = 'CONNECTED';
      entry.connectedAt = Date.now();
    } catch (err) {
      sdk.markDisconnected();
      this.markError(entry, err);
      throw err;
    }
  }

  async connectAll(session: Session): Promise<void> {
    await Promise.allSettled(
      Array.from(this.plugins.keys()).map(id => this.connect(id, session))
    );
  }

  // ─── Disconnection ──────────────────────────────────────────────────────────

  async disconnect(pluginId: string): Promise<void> {
    const entry = this.require(pluginId);
    if (entry.status !== 'CONNECTED' && entry.status !== 'PAUSED') return;

    try {
      await entry.plugin.disconnect();
    } finally {
      entry.sdk?.markDisconnected();
      entry.sdk = null;
      entry.status = 'DISCONNECTED';
      entry.disconnectedAt = Date.now();
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.plugins.keys()).map(id => this.disconnect(id))
    );
  }

  // ─── Pause / Resume ─────────────────────────────────────────────────────────

  async pause(pluginId: string): Promise<void> {
    const entry = this.require(pluginId);
    if (entry.status !== 'CONNECTED') return;

    if (entry.plugin.onSessionPause) {
      try {
        await entry.plugin.onSessionPause();
      } catch (err) {
        this.markError(entry, err);
        throw err;
      }
    }
    entry.status = 'PAUSED';
  }

  async resume(pluginId: string): Promise<void> {
    const entry = this.require(pluginId);
    if (entry.status !== 'PAUSED') return;

    if (entry.plugin.onSessionResume) {
      try {
        await entry.plugin.onSessionResume();
      } catch (err) {
        this.markError(entry, err);
        throw err;
      }
    }
    entry.status = 'CONNECTED';
  }

  async pauseAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.plugins.keys()).map(id => this.pause(id))
    );
  }

  async resumeAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.plugins.keys()).map(id => this.resume(id))
    );
  }

  // ─── Health ─────────────────────────────────────────────────────────────────

  async health(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();

    await Promise.allSettled(
      Array.from(this.plugins.values()).map(async entry => {
        if (entry.status !== 'CONNECTED' || !entry.plugin.onHealthCheck) {
          results.set(entry.plugin.id, {
            healthy: entry.status !== 'ERROR',
            message: entry.status,
          });
          return;
        }
        try {
          const status = await entry.plugin.onHealthCheck();
          results.set(entry.plugin.id, status);
        } catch (err) {
          results.set(entry.plugin.id, {
            healthy: false,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    return results;
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  getPlugin(pluginId: string): ObserverPlugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  getEntry(pluginId: string): PluginEntry | undefined {
    return this.plugins.get(pluginId);
  }

  getStatus(pluginId: string): PluginStatus | undefined {
    return this.plugins.get(pluginId)?.status;
  }

  list(): ObserverPlugin[] {
    return Array.from(this.plugins.values()).map(e => e.plugin);
  }

  listConnected(): ObserverPlugin[] {
    return Array.from(this.plugins.values())
      .filter(e => e.status === 'CONNECTED')
      .map(e => e.plugin);
  }

  // ─── Logging ────────────────────────────────────────────────────────────────

  onPluginLog(subscriber: PluginLogSubscriber): () => void {
    this.logSubscribers.add(subscriber);
    return () => this.logSubscribers.delete(subscriber);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private require(pluginId: string): PluginEntry {
    const entry = this.plugins.get(pluginId);
    if (!entry) throw new Error(`Plugin not registered: ${pluginId}`);
    return entry;
  }

  private markError(entry: PluginEntry, err: unknown): void {
    entry.status = 'ERROR';
    entry.error = err instanceof Error ? err : new Error(String(err));
  }
}
