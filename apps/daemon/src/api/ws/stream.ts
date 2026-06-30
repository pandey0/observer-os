import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ObserverCore } from '@observer-os/core';
import type { StreamMessage, ClientMessage } from '../types.js';

/**
 * WebSocket live stream endpoint: GET /ws/sessions/:id
 *
 * On connect:
 *   1. Sends a `snapshot` of current graph state (all events + nodes)
 *   2. Subscribes to live event + node changes
 *   3. Pushes incremental `event` and `node` messages as they arrive
 *
 * Client can send:
 *   { type: 'ping' }  → { type: 'pong' }
 *   { type: 'subscribe', afterSequence: N }  → resend snapshot from sequence N
 */
export function registerStreamRoutes(app: FastifyInstance, core: ObserverCore): void {
  app.get(
    '/ws/sessions/:id',
    { websocket: true },
    (socket: WebSocket, req) => {
      const { id: sessionId } = (req.params as { id: string });

      const session = core.sessions.get(sessionId as never);
      if (!session) {
        send(socket, { type: 'error', code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found` });
        socket.close(1008, 'Session not found');
        return;
      }

      // Send initial snapshot
      sendSnapshot(socket, core, sessionId);

      // Subscribe to live events
      const unsubEvent = core.events.subscribe(sessionId as never, event => {
        send(socket, { type: 'event', data: event });
      });

      // Subscribe to live node changes
      const unsubNode = core.graph.onNodeChange(node => {
        if ((node.sessionId as string) === sessionId) {
          send(socket, { type: 'node', data: node });
        }
      });

      // Handle client messages
      socket.on('message', raw => {
        try {
          const msg = JSON.parse(raw.toString()) as ClientMessage;
          if (msg.type === 'ping') {
            send(socket, { type: 'pong' });
          } else if (msg.type === 'subscribe') {
            sendSnapshot(socket, core, sessionId, msg.afterSequence);
          }
        } catch {
          send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Malformed JSON' });
        }
      });

      socket.on('close', () => {
        unsubEvent();
        unsubNode();
      });

      socket.on('error', () => {
        unsubEvent();
        unsubNode();
      });
    }
  );
}

function sendSnapshot(
  socket: WebSocket,
  core: ObserverCore,
  sessionId: string,
  afterSequence?: number,
): void {
  const events = core.events.read(sessionId as never, { afterSequence });
  const nodes = core.graph.getNodes(sessionId as never);
  send(socket, { type: 'snapshot', events, nodes });
}

function send(socket: WebSocket, msg: StreamMessage): void {
  if (socket.readyState === socket.OPEN) {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // socket closed between readyState check and send — ignore
    }
  }
}
