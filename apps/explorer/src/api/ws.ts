import type { WsMessage, RuntimeEvent, RuntimeNode } from './types.js';

export interface WsHandlers {
  onSnapshot(events: RuntimeEvent[], nodes: RuntimeNode[]): void;
  onEvent(event: RuntimeEvent): void;
  onNode(node: RuntimeNode): void;
  onConnect(): void;
  onDisconnect(): void;
  onReconnecting?(attempt: number): void;
}

const WS_BASE = 'ws://localhost:4000/ws';
const PING_INTERVAL = 25_000;

export function connectSession(sessionId: string, handlers: WsHandlers): () => void {
  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let attempt = 0;

  function connect() {
    ws = new WebSocket(`${WS_BASE}/sessions/${sessionId}`);

    ws.onopen = () => {
      attempt = 0;
      handlers.onConnect();
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onclose = (event) => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (closed) {
        handlers.onDisconnect();
        return;
      }
      if (event.code !== 1000) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        handlers.onReconnecting?.(attempt);
        attempt++;
        setTimeout(connect, delay);
      } else {
        handlers.onDisconnect();
      }
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      let msg: WsMessage;
      try { msg = JSON.parse(e.data) as WsMessage; } catch { return; }

      switch (msg.type) {
        case 'snapshot': handlers.onSnapshot(msg.events ?? msg.data?.events ?? [], msg.nodes ?? msg.data?.nodes ?? []); break;
        case 'event':    { const ev = msg.event ?? msg.data; if (ev) handlers.onEvent(ev); break; }
        case 'node':     { const n = msg.node ?? msg.data; if (n) handlers.onNode(n); break; }
        case 'pong':     break;
      }
    };
  }

  connect();

  return () => {
    closed = true;
    if (pingTimer) clearInterval(pingTimer);
    ws?.close(1000);
  };
}
