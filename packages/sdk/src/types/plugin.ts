import type {
  NodeId,
  WorkspaceId,
  SessionId,
  RuntimeEvent,
  NodeTypeRegistration,
  EmitInput,
  Severity,
} from '@observer-os/core';

// ─── Runtime types ────────────────────────────────────────────────────────────

export type RuntimeType =
  | 'BROWSER'
  | 'NODEJS'
  | 'REACT'
  | 'EXPRESS'
  | 'POSTGRESQL'
  | 'REDIS'
  | 'DOCKER'
  | 'TERMINAL'
  | 'CUSTOM';

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface Workspace {
  readonly id: WorkspaceId;
  readonly rootPath: string;
  readonly name: string;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export interface DiscoveryResult {
  readonly detected: boolean;
  readonly confidence: number;    // 0.0–1.0
  readonly version?: string;      // detected runtime version
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── Session info exposed to plugins ─────────────────────────────────────────

export interface SessionInfo {
  readonly id: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly startedAt: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export type PluginConfig = Readonly<Record<string, unknown>>;

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthStatus {
  readonly healthy: boolean;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface PluginLogEntry {
  readonly level: LogLevel;
  readonly pluginId: string;
  readonly message: string;
  readonly timestamp: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── SDK — what plugins call ──────────────────────────────────────────────────

export interface ObserverSDK {
  /** Emit a single event into the session's Event Log. */
  emit(input: EmitInput): RuntimeEvent;

  /** Emit multiple events atomically (all-or-none, same tick). */
  emitBatch(inputs: readonly EmitInput[]): RuntimeEvent[];

  /**
   * Generate a stable NodeId for a given key within this plugin's namespace.
   * Same key always produces same ID — safe to call on reconnect.
   */
  generateNodeId(stableKey: string): NodeId;

  /** Write a structured log entry (NOT emitted as RuntimeEvent — goes to plugin log). */
  log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void;

  /** Get plugin config values. */
  getConfig<T extends PluginConfig = PluginConfig>(): T;

  /** Get current session context. */
  getSession(): SessionInfo;

  /** True while plugin is connected to an active session. */
  isConnected(): boolean;
}

// ─── Plugin interface — what plugin authors implement ─────────────────────────

export interface ObserverPlugin {
  /** Globally unique plugin identifier. Reverse-DNS style: "observer.browser" */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /** SemVer plugin version. */
  readonly version: string;

  /** Minimum SDK version required. */
  readonly sdkVersion: string;

  /** The runtime this plugin instruments. */
  readonly runtimeType: RuntimeType;

  /**
   * Called once at startup. Plugin probes the workspace and reports whether
   * it detected its target runtime. High confidence → auto-activate.
   */
  discover(workspace: Workspace): Promise<DiscoveryResult>;

  /**
   * Called when a session starts. Plugin receives the SDK it uses to emit events.
   * After this returns, the plugin MUST only communicate via sdk.emit().
   */
  connect(session: SessionInfo, sdk: ObserverSDK, config?: PluginConfig): Promise<void>;

  /** Called when session ends. Plugin must clean up all instrumentation. */
  disconnect(): Promise<void>;

  /** Optional: called when session is paused. Plugin should stop emitting. */
  onSessionPause?(): Promise<void>;

  /** Optional: called when session is resumed after pause. */
  onSessionResume?(): Promise<void>;

  /** Optional: called by health monitor every 30s. */
  onHealthCheck?(): Promise<HealthStatus>;

  /**
   * Declare all node types this plugin can emit.
   * Called at registration time — must be static (no async).
   */
  getNodeTypes(): NodeTypeRegistration[];
}
