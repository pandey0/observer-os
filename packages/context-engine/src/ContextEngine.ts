import type { RuntimeNode, RuntimeEvent, SessionId } from '@observer-os/core';
import type { ContextRequest, ContextPackage, DepthLevel, OutputFormat } from './types.js';
import { resolveAnchorNode, findBestErrorAnchor } from './anchors/resolveAnchor.js';
import {
  buildCausalChain,
  collectReachableNodes,
  findCorrelatedNodes,
} from './pipeline/buildCausalChain.js';
import { scoreNodes, scoreEvents } from './pipeline/scoreNodes.js';
import { renderMarkdown, estimateTokens } from './render/markdown.js';
import { parseStackFrames, extractStack } from './pipeline/parseStackFrames.js';

const DEPTH_HOPS: Record<DepthLevel, number> = {
  SURFACE:  1,
  DETAILED: 3,
  FULL:     6,
};

const DEPTH_NODE_LIMIT: Record<DepthLevel, number> = {
  SURFACE:  5,
  DETAILED: 15,
  FULL:     50,
};

const DEPTH_EVENT_LIMIT: Record<DepthLevel, number> = {
  SURFACE:  10,
  DETAILED: 30,
  FULL:     100,
};

export interface GraphSnapshot {
  nodes: RuntimeNode[];
  events: RuntimeEvent[];
}

export class ContextEngine {
  /**
   * Build a context package from a graph snapshot.
   * Stateless — caller supplies the graph data.
   */
  build(request: ContextRequest, snapshot: GraphSnapshot): ContextPackage {
    const depth = request.depth ?? 'DETAILED';
    const format = request.format ?? 'MARKDOWN';
    const { nodes, events } = snapshot;

    // 1. Resolve anchor node
    let anchorNode: RuntimeNode | null;
    if (request.anchor.type === 'error') {
      anchorNode = findBestErrorAnchor(request.anchor.nodeId, nodes);
    } else {
      anchorNode = resolveAnchorNode(request.anchor.nodeId, request.anchor.type, nodes);
    }

    if (!anchorNode) {
      throw new Error(`Anchor node not found: ${request.anchor.nodeId}`);
    }

    // 2. Build causal chain (walk TRIGGERED links upward)
    const causalChain = buildCausalChain(anchorNode, nodes);

    // 3. Find correlated nodes (CORRELATED_WITH edges first, then correlationId fallback)
    const correlatedIds = findCorrelatedNodes(anchorNode, nodes);

    // Fallback: if no relationship edges, discover nodes via shared correlationId in events
    if (correlatedIds.length === 0) {
      const anchorEvents = events.filter(
        (e) => e.sourceNodeId === anchorNode!.id || e.affectedNodeIds.includes(anchorNode!.id)
      );
      const corrIds = new Set(anchorEvents.map((e) => e.correlationId).filter(Boolean));
      if (corrIds.size > 0) {
        for (const ev of events) {
          if (ev.sourceNodeId !== anchorNode!.id && corrIds.has(ev.correlationId)) {
            if (!correlatedIds.includes(ev.sourceNodeId as string)) {
              correlatedIds.push(ev.sourceNodeId as string);
            }
          }
        }
      }
    }

    // 4. Collect reachable nodes within depth hops
    const hops = DEPTH_HOPS[depth];
    const reachableIds = collectReachableNodes(anchorNode, nodes, hops);

    // Add causal chain + correlated nodes to reachable set
    for (const id of causalChain) reachableIds.add(id);
    for (const id of correlatedIds) reachableIds.add(id);

    const reachableNodes = nodes.filter((n) => reachableIds.has(n.id));

    // 5. Score + rank nodes
    const rankedNodes = scoreNodes(reachableNodes, anchorNode.id, causalChain, correlatedIds)
      .slice(0, DEPTH_NODE_LIMIT[depth]);

    // 6. Score + rank events
    const rankedEvents = scoreEvents(events, anchorNode.id, reachableIds)
      .slice(0, DEPTH_EVENT_LIMIT[depth]);

    // 7. Parse source frames from anchor node or its events
    const anchorEvents = events.filter(
      (e) => e.sourceNodeId === anchorNode!.id || e.affectedNodeIds.includes(anchorNode!.id)
    );
    let sourceFrames = parseStackFrames(
      extractStack(anchorNode.metadata as Record<string, unknown> ?? {}) ?? ''
    );
    if (sourceFrames.length === 0) {
      for (const ev of anchorEvents) {
        const stack = extractStack(ev.payload as Record<string, unknown> ?? {});
        if (stack) { sourceFrames = parseStackFrames(stack); break; }
      }
    }

    // 8. Render
    const partial = {
      sessionId: request.sessionId,
      anchor: request.anchor,
      depth,
      format,
      nodes: rankedNodes,
      events: rankedEvents,
      causalChain,
      correlatedNodes: correlatedIds,
      sourceFrames,
      generatedAt: Date.now(),
    };

    const markdownContent = renderMarkdown(partial);
    const tokenEstimate = estimateTokens(markdownContent);

    return { ...partial, markdownContent, tokenEstimate };
  }
}
