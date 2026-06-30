import { tryRequire } from '../detect';
import type { EventQueue } from '../queue';

let seq = 0;

interface WsModule {
  Server?: new (...args: unknown[]) => {
    on(event: string, listener: (...args: unknown[]) => void): unknown;
  };
  WebSocketServer?: new (...args: unknown[]) => {
    on(event: string, listener: (...args: unknown[]) => void): unknown;
  };
}

export function patchWsServer(queue: EventQueue): boolean {
  const ws = tryRequire('ws') as WsModule | null;
  if (!ws) return false;

  const ServerClass = ws.WebSocketServer ?? ws.Server;
  if (!ServerClass) return false;

  const origOn = ServerClass.prototype.on as (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => unknown;

  ServerClass.prototype.on = function observerOn(
    event: string,
    listener: (...args: unknown[]) => void,
  ) {
    if (event !== 'connection') return origOn.call(this as object, event, listener);

    return origOn.call(this as object, event, (socket: unknown, req: unknown) => {
      const reqObj = req as { socket?: { remoteAddress?: string; remotePort?: number } };
      const clientAddr = `${reqObj?.socket?.remoteAddress ?? 'unknown'}:${reqObj?.socket?.remotePort ?? 0}`;
      const nodeId = `ws:client:${++seq}`;

      queue.push({
        type: 'observer.ws/client.connected',
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        severity: 'INFO',
        payload: { client: clientAddr },
      });

      const socketObj = socket as {
        on(event: string, fn: (...args: unknown[]) => void): void;
      };

      socketObj.on('message', (data: unknown) => {
        const size = Buffer.isBuffer(data)
          ? (data as Buffer).length
          : typeof data === 'string'
            ? (data as string).length
            : 0;
        queue.push({
          type: 'observer.ws/client.message',
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: 'DEBUG',
          payload: { client: clientAddr, size },
        });
      });

      socketObj.on('close', (code: unknown, reason: unknown) => {
        queue.push({
          type: 'observer.ws/client.disconnected',
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: typeof code === 'number' && code > 1001 ? 'WARN' : 'INFO',
          payload: { client: clientAddr, code, reason: reason?.toString() },
        });
      });

      socketObj.on('error', (err: unknown) => {
        queue.push({
          type: 'observer.ws/client.error',
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: 'ERROR',
          payload: {
            client: clientAddr,
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        });
      });

      listener(socket, req);
    });
  };

  return true;
}
