import type { RuntimeNode, RuntimeEvent, NodeId } from '@observer-os/core';
import type { RankedNode, RankedEvent } from '../types.js';

const SEVERITY_WEIGHT: Record<string, number> = {
  FATAL: 50,
  ERROR: 40,
  WARN: 20,
  INFO: 5,
  DEBUG: 1,
};

const STATUS_WEIGHT: Record<string, number> = {
  FAILED: 50,
  ACTIVE: 20,
  COMPLETED: 5,
  DISCOVERED: 2,
  DESTROYED: 1,
  ARCHIVED: 1,
};

/**
 * Score and rank nodes. Higher score = more relevant.
 *
 * Scoring factors:
 * - causal distance from anchor (closer = higher)
 * - node status (FAILED > ACTIVE > COMPLETED > ...)
 * - recency (more recent = higher)
 * - is anchor (always highest)
 */
export function scoreNodes(
  nodes: RuntimeNode[],
  anchorId: string,
  causalChain: string[],
  correlatedIds: string[]
): RankedNode[] {
  const now = Date.now();
  const chainSet = new Set(causalChain);
  const chainIndexMap = new Map(causalChain.map((id, i) => [id, i]));
  const chainLen = causalChain.length;

  const scored = nodes.map((node) => {
    let score = 0;
    const reasons: string[] = [];

    if (node.id === anchorId) {
      score += 200;
      reasons.push('anchor');
    }

    if (chainSet.has(node.id)) {
      const idx = chainIndexMap.get(node.id) ?? 0;
      const distFromAnchor = chainLen - 1 - idx;
      score += Math.max(0, 80 - distFromAnchor * 15);
      reasons.push(`causal chain (hop ${distFromAnchor})`);
    }

    if (correlatedIds.includes(node.id)) {
      score += 60;
      reasons.push('correlated');
    }

    score += STATUS_WEIGHT[node.status] ?? 0;

    // Recency (0–20 points, decays over 60s)
    const updatedAt = node.updatedAt || node.createdAt || now;
    const ageSecs = (now - updatedAt) / 1000;
    score += Math.max(0, 20 - ageSecs / 3);

    return { node, score, reason: reasons.join(', ') || 'graph neighbor' };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s, i) => ({
    node: s.node,
    relevanceScore: Math.round(s.score),
    rank: i + 1,
    reason: s.reason,
  }));
}

/**
 * Score events relative to the anchor and node set.
 */
export function scoreEvents(
  events: RuntimeEvent[],
  anchorId: string,
  relevantNodeIds: Set<string>
): RankedEvent[] {
  const now = Date.now();

  const scored = events
    .filter((e) => relevantNodeIds.has(e.sourceNodeId) || e.affectedNodeIds.some((id) => relevantNodeIds.has(id)))
    .map((event) => {
      let score = 0;

      if (event.sourceNodeId === anchorId || event.affectedNodeIds.includes(anchorId as NodeId)) {
        score += 100;
      }

      score += SEVERITY_WEIGHT[event.severity] ?? 5;

      const ageSecs = (now - event.occurredAt) / 1000;
      score += Math.max(0, 30 - ageSecs / 2);

      return { event, score };
    });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s, i) => ({
    event: s.event,
    relevanceScore: Math.round(s.score),
    rank: i + 1,
  }));
}
