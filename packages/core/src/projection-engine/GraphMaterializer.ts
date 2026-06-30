import type { RuntimeEvent, RuntimeNode, Relationship, NodeId, RelationshipType } from '../types/index.js';
import { newRelationshipId } from '../utils/id.js';
import { asDomainId } from '../types/ids.js';

export type NodeChangeSubscriber = (node: RuntimeNode) => void;

export class GraphMaterializer {
  private readonly nodes = new Map<NodeId, RuntimeNode>();
  private readonly subscribers = new Set<NodeChangeSubscriber>();
  // correlationId → set of nodeIds that share it
  private readonly correlationIndex = new Map<string, Set<NodeId>>();

  process(event: RuntimeEvent): void {
    const existing = this.nodes.get(event.sourceNodeId);

    if (!existing) {
      // First event referencing this node — materialize it
      this.upsert({
        id: event.sourceNodeId,
        type: this.inferNodeType(event.type),
        domain: asDomainId(this.inferDomain(event.type)),
        sessionId: event.sessionId,
        workspaceId: event.workspaceId,
        status: this.statusFromEvent(event.type, 'ACTIVE'),
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        metadata: { ...event.payload },
        capabilities: [],
        relationships: [],
        version: 1,
        visibility: 'LOCAL',
      });
    } else {
      this.upsert({
        ...existing,
        // When a new session's event arrives for an existing node, migrate the node
        // to the new session so getNodes(newSessionId) includes it.
        sessionId: event.sessionId ?? existing.sessionId,
        workspaceId: event.workspaceId ?? existing.workspaceId,
        updatedAt: event.occurredAt,
        metadata: { ...existing.metadata, ...event.payload },
        status: this.statusFromEvent(event.type, existing.status),
        completedAt: this.isTerminalEvent(event.type) ? event.occurredAt : existing.completedAt,
        version: existing.version + 1,
      });
    }

    // Auto-link nodes sharing the same correlationId
    if (event.correlationId) {
      const cid = event.correlationId;
      if (!this.correlationIndex.has(cid)) {
        this.correlationIndex.set(cid, new Set());
      }
      const peers = this.correlationIndex.get(cid)!;
      const nodeId = event.sourceNodeId;
      // Add CORRELATED_WITH edges between this node and all prior peers
      for (const peerId of peers) {
        if (peerId !== nodeId) {
          this.addRelationship(peerId, nodeId, 'CORRELATED_WITH');
        }
      }
      peers.add(nodeId);
    }
  }

  addRelationship(sourceId: NodeId, targetId: NodeId, type: RelationshipType): Relationship | null {
    const source = this.nodes.get(sourceId);
    if (!source) return null;

    // Avoid duplicate relationships of the same type between same nodes
    const exists = source.relationships.some(
      r => r.target === targetId && r.type === type
    );
    if (exists) return null;

    const rel: Relationship = {
      id: newRelationshipId(),
      type,
      source: sourceId,
      target: targetId,
      recordedAt: Date.now(),
    };

    this.upsert({
      ...source,
      relationships: [...source.relationships, rel],
    });

    return rel;
  }

  upsert(node: RuntimeNode): void {
    this.nodes.set(node.id, node);
    for (const sub of this.subscribers) {
      try { sub(node); } catch { /* never let subscriber errors corrupt state */ }
    }
  }

  getNode(id: NodeId): RuntimeNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(sessionId: string): RuntimeNode[] {
    return Array.from(this.nodes.values()).filter(n => n.sessionId === sessionId);
  }

  subscribe(sub: NodeChangeSubscriber): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  // Infer node type from event type namespace
  // e.g. "observer.browser/network.request.started" → "observer.browser/HttpRequest"
  private inferNodeType(eventType: string): string {
    const slashIdx = eventType.indexOf('/');
    if (slashIdx === -1) return 'observer/UnknownNode';
    const namespace = eventType.slice(0, slashIdx);
    const action = eventType.slice(slashIdx + 1);

    const typeMap: Record<string, string> = {
      // Browser plugin
      'fetch': 'FetchRequest',
      'xhr': 'XhrRequest',
      'console': 'ConsoleMessage',
      'exception': 'Exception',
      'navigation': 'Navigation',
      'storage': 'StorageEntry',
      'performance': 'PerformanceMark',
      // Legacy / generic browser
      'network.request': 'HttpRequest',
      'network.websocket': 'WebSocketConnection',
      'dom.interaction': 'DomInteraction',
      'dom.mutation': 'DomElement',
      // Express plugin
      'route': 'Route',
      'error': 'ErrorHandler',
      'middleware': 'Middleware',
      // Postgres plugin
      'query': 'Query',
      'transaction': 'Transaction',
      'connection': 'Connection',
      'pool': 'PostgresPool',
      // Redis plugin
      'client': 'RedisClient',
      'command': 'Command',
      // WebSocket server plugin
      'ws.connection': 'WebSocketConnection',
      'ws.message': 'WebSocketMessage',
      // HTTP server/client plugin
      'server': 'HttpServer',
      'request': 'HttpServerRequest',
      'http-client.request': 'HttpClientRequest',
      // React plugin
      'react.component': 'ReactComponent',
      'react.hook': 'ReactHook',
      // Other
      'backend.request': 'HttpRequest',
      'database.query': 'DatabaseQuery',
      'database.transaction': 'Transaction',
    };

    for (const [prefix, typeName] of Object.entries(typeMap)) {
      if (action.startsWith(prefix)) return `${namespace}/${typeName}`;
    }

    return `${namespace}/UnknownNode`;
  }

  private inferDomain(eventType: string): string {
    // 'observer.express/request.started' → 'express'
    const slashIdx = eventType.indexOf('/');
    const namespace = slashIdx === -1 ? eventType : eventType.slice(0, slashIdx);
    const dotIdx = namespace.indexOf('.');
    return dotIdx === -1 ? namespace : namespace.slice(dotIdx + 1);
  }

  private statusFromEvent(
    eventType: string,
    current: RuntimeNode['status']
  ): RuntimeNode['status'] {
    // Infrastructure nodes stay ACTIVE — completed/failed commands are events on them, not state changes
    const infraEvents = [
      'observer.redis/client.connected',
      'observer.postgres/pool.connected',
      'observer.http-server/server.started',
    ];
    if (infraEvents.includes(eventType)) return 'ACTIVE';

    // For infrastructure nodes receiving operation events, don't change their status
    if (
      eventType.includes('/command.') ||
      eventType.includes('/query.')
    ) return current;

    if (eventType.endsWith('.completed') || eventType.endsWith('.done')) return 'COMPLETED';
    if (eventType.endsWith('.failed') || eventType.endsWith('.error')) return 'FAILED';
    if (eventType.endsWith('.destroyed') || eventType.endsWith('.unmounted')) return 'DESTROYED';
    if (eventType.endsWith('.started') || eventType.endsWith('.mounted')) return 'ACTIVE';
    return current;
  }

  private isTerminalEvent(eventType: string): boolean {
    return (
      eventType.endsWith('.completed') ||
      eventType.endsWith('.failed') ||
      eventType.endsWith('.destroyed') ||
      eventType.endsWith('.unmounted')
    );
  }
}
