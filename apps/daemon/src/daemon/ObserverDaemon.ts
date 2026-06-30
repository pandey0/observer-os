import { loadCore } from '@observer-os/core';
import type { ObserverCore } from '@observer-os/core';
import { PluginRegistry } from '@observer-os/sdk';
import type { ObserverPlugin } from '@observer-os/sdk';
import type { PluginConfig } from '@observer-os/sdk';
import { ApiServer } from '../api/ApiServer.js';
import { PluginLoader } from '../plugins/PluginLoader.js';
import { resolveConfig } from '../config/DaemonConfig.js';
import type { DaemonConfig } from '../config/DaemonConfig.js';

export type DaemonState = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED';

export class ObserverDaemon {
  readonly core: ObserverCore;
  readonly registry: PluginRegistry;
  readonly api: ApiServer;
  readonly loader: PluginLoader;
  readonly config: DaemonConfig;

  private state: DaemonState = 'IDLE';
  private shutdownHandlers: Array<() => void> = [];

  constructor(config?: Partial<DaemonConfig>) {
    this.config = resolveConfig(config);
    this.core = loadCore(this.config.storagePath);
    this.registry = new PluginRegistry(this.core.sessions);
    this.loader = new PluginLoader();
    this.api = new ApiServer(this.core, this.registry, this.config);
  }

  /** Register a plugin before start(). */
  use(plugin: ObserverPlugin, config?: PluginConfig): this {
    this.loader.add(plugin, config);
    return this;
  }

  getState(): DaemonState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.state !== 'IDLE') throw new Error(`Cannot start daemon in state ${this.state}`);
    this.state = 'STARTING';

    // Load plugins into registry
    this.loader.load(this.registry);

    // Init API server (register routes, ready Fastify)
    await this.api.init();

    // Bind to port
    await this.api.listen();

    this.state = 'RUNNING';

    // Wire OS signal handlers for graceful shutdown
    const stop = () => void this.stop().catch(console.error);
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    this.shutdownHandlers = [
      () => process.off('SIGTERM', stop),
      () => process.off('SIGINT', stop),
    ];
  }

  async stop(): Promise<void> {
    if (this.state !== 'RUNNING') return;
    this.state = 'STOPPING';

    // Disconnect all plugins
    await this.registry.disconnectAll();

    // End all active sessions
    for (const session of this.core.sessions.list()) {
      if (session.status === 'ACTIVE' || session.status === 'PAUSED') {
        this.core.sessions.end(session.id);
      }
    }

    // Shutdown API server
    await this.api.close();

    // Dispose core engine
    this.core.dispose();

    // Clean up signal handlers
    for (const remove of this.shutdownHandlers) remove();
    this.shutdownHandlers = [];

    this.state = 'STOPPED';
  }

  /** Only binds routes + readies Fastify — does NOT listen on a port. Used for testing. */
  async init(): Promise<void> {
    if (this.state !== 'IDLE') throw new Error(`Cannot init daemon in state ${this.state}`);
    this.state = 'RUNNING';
    this.loader.load(this.registry);
    await this.api.init();
  }
}
