import type { RequestHandler, ErrorRequestHandler } from 'express';
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
import {
  createRequestMiddleware,
  createErrorMiddleware,
} from './middleware/observerMiddleware.js';
import { EXPRESS_NODE_TYPES } from './node-types.js';

export class ExpressObserverPlugin implements ObserverPlugin {
  readonly id = 'observer.express';
  readonly name = 'Express Observer';
  readonly version = '0.1.0';
  readonly sdkVersion = '0.1.0';
  readonly runtimeType = 'EXPRESS' as const;

  private sdk: ObserverSDK | null = null;
  private _requestMiddleware: RequestHandler | null = null;
  private _errorMiddleware: ErrorRequestHandler | null = null;

  async discover(_workspace: Workspace): Promise<DiscoveryResult> {
    try {
      // Check express is available in the current module resolution scope
      await import('express');
      return { detected: true, confidence: 0.9 };
    } catch {
      return { detected: false, confidence: 1.0 };
    }
  }

  async connect(_session: SessionInfo, sdk: ObserverSDK, _config?: PluginConfig): Promise<void> {
    this.sdk = sdk;
    this._requestMiddleware = createRequestMiddleware(sdk);
    this._errorMiddleware = createErrorMiddleware(sdk);
    sdk.log('info', 'Express observer connected — add app.use(plugin.middleware()) to your app');
    sdk.log('info', 'For error capture: app.use(plugin.errorMiddleware()) after all routes');
  }

  async disconnect(): Promise<void> {
    this.sdk = null;
    this._requestMiddleware = null;
    this._errorMiddleware = null;
  }

  async onHealthCheck(): Promise<HealthStatus> {
    const alive = this.sdk?.isConnected() === true;
    return {
      healthy: alive,
      message: alive ? 'Middleware active' : 'Not connected',
    };
  }

  getNodeTypes(): NodeTypeRegistration[] {
    return EXPRESS_NODE_TYPES;
  }

  /**
   * Returns a stable RequestHandler. Add once: app.use(plugin.middleware())
   *
   * Safe to call before connect() — no-ops until plugin is connected.
   * Safe to call after disconnect() — reverts to no-op automatically.
   */
  middleware(): RequestHandler {
    return (req, res, next) => {
      if (this._requestMiddleware) {
        this._requestMiddleware(req, res, next);
      } else {
        next();
      }
    };
  }

  /**
   * Returns a 4-arg error-capturing middleware. Place AFTER all routes:
   *   app.use(plugin.errorMiddleware())
   *
   * Emits ERROR_CAUGHT event and passes error down to next error handler.
   */
  errorMiddleware(): ErrorRequestHandler {
    return (err, req, res, next) => {
      if (this._errorMiddleware) {
        this._errorMiddleware(err, req, res, next);
      } else {
        next(err);
      }
    };
  }
}
