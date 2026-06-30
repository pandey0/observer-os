import type {
  ObserverPlugin,
  ObserverSDK,
  DiscoveryResult,
  Workspace,
  SessionInfo,
  PluginConfig,
  HealthStatus,
} from '@observer-os/sdk';
import type { NodeTypeRegistration } from '@observer-os/core';
import { BridgeServer } from './bridge/BridgeServer.js';
import { BROWSER_NODE_TYPES } from './node-types.js';

export interface BrowserObserverConfig extends PluginConfig {
  readonly bridgePort?: number;
  readonly bridgeHost?: string;
  readonly corsOrigins?: string[];
}

const DEFAULT_BRIDGE_PORT = 7891;
const DEFAULT_BRIDGE_HOST = '127.0.0.1';

export class BrowserObserverPlugin implements ObserverPlugin {
  readonly id = 'observer.browser';
  readonly name = 'Browser Observer';
  readonly version = '0.1.0';
  readonly sdkVersion = '0.1.0';
  readonly runtimeType = 'BROWSER' as const;

  private bridge: BridgeServer | null = null;
  private sdk: ObserverSDK | null = null;
  private pluginConfig: BrowserObserverConfig = {};

  async discover(_workspace: Workspace): Promise<DiscoveryResult> {
    // Browser observable from any workspace — developer opts in explicitly
    return { detected: true, confidence: 0.5, version: 'unknown' };
  }

  async connect(session: SessionInfo, sdk: ObserverSDK, config?: PluginConfig): Promise<void> {
    this.sdk = sdk;
    this.pluginConfig = (config ?? {}) as BrowserObserverConfig;

    const bridgePort = this.pluginConfig.bridgePort ?? DEFAULT_BRIDGE_PORT;
    const bridgeHost = this.pluginConfig.bridgeHost ?? DEFAULT_BRIDGE_HOST;
    const corsOrigins = this.pluginConfig.corsOrigins ?? ['*'];

    this.bridge = new BridgeServer(sdk, {
      port: bridgePort,
      host: bridgeHost,
      sessionId: session.id as string,
      corsOrigins,
    });

    await this.bridge.start();

    sdk.log('info', `Bridge server started at ${this.bridge.address}`);
    sdk.log('info', `Inject script: ${this.bridge.address}/observer-inject.js`);
    sdk.log('info', 'Add to your page: <script src="' + this.bridge.address + '/observer-inject.js"></script>');
  }

  async disconnect(): Promise<void> {
    await this.bridge?.stop();
    this.bridge = null;
    this.sdk = null;
  }

  async onSessionPause(): Promise<void> {
    // Bridge stays up during pause — browser is still running
    // Plugin just stops emitting from bridge by ignoring inbound events
  }

  async onSessionResume(): Promise<void> {
    // Bridge resumes forwarding events
  }

  async onHealthCheck(): Promise<HealthStatus> {
    const alive = this.bridge !== null && this.sdk?.isConnected() === true;
    return {
      healthy: alive,
      message: alive
        ? `Bridge running at ${this.bridge!.address}`
        : 'Bridge not started',
      details: {
        bridgePort: this.pluginConfig.bridgePort ?? DEFAULT_BRIDGE_PORT,
        bridgeHost: this.pluginConfig.bridgeHost ?? DEFAULT_BRIDGE_HOST,
      },
    };
  }

  getNodeTypes(): NodeTypeRegistration[] {
    return BROWSER_NODE_TYPES;
  }

  get bridgeAddress(): string | null {
    return this.bridge?.address ?? null;
  }
}
