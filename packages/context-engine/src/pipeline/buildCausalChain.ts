import type { RuntimeNode } from '@observer-os/core';

const MAX_HOPS = 6;

/**
 * Walk causedBy links upward from anchor to find root.
 * Returns ordered array [root, ..., anchor].
 * Uses relationships of type TRIGGERED (source caused target) walking backward.
 */
export function buildCausalChain(
  anchorNode: RuntimeNode,
  allNodes: RuntimeNode[]
): string[] {
  const chain: string[] = [anchorNode.id];
  const visited = new Set<string>([anchorNode.id]);

  let current = anchorNode;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    // Find a node that TRIGGERED current (current is the target)
    const parent = findTriggerParent(current.id, allNodes, visited);
    if (!parent) break;

    chain.unshift(parent.id); // prepend so result is root → anchor
    visited.add(parent.id);
    current = parent;
  }

  return chain;
}

/**
 * Find nodes directly triggered by or correlated with anchor.
 * Returns IDs within up to N hops.
 */
export function collectReachableNodes(
  anchorNode: RuntimeNode,
  allNodes: RuntimeNode[],
  maxHops: number
): Set<string> {
  const reachable = new Set<string>([anchorNode.id]);
  const queue: Array<{ node: RuntimeNode; depth: number }> = [{ node: anchorNode, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= maxHops) continue;

    for (const rel of item.node.relationships) {
      const neighbor = allNodes.find((n) => n.id === rel.target || n.id === rel.source);
      if (!neighbor || reachable.has(neighbor.id)) continue;
      reachable.add(neighbor.id);
      queue.push({ node: neighbor, depth: item.depth + 1 });
    }
  }

  return reachable;
}

/**
 * Find CORRELATED_WITH neighbors of anchor (cross-domain correlation).
 */
export function findCorrelatedNodes(
  anchorNode: RuntimeNode,
  allNodes: RuntimeNode[]
): string[] {
  const correlated: string[] = [];

  for (const rel of anchorNode.relationships) {
    if (rel.type === 'CORRELATED_WITH') {
      const target = rel.source === anchorNode.id ? rel.target : rel.source;
      if (target !== anchorNode.id) correlated.push(target);
    }
  }

  // Also scan all nodes' relationships pointing to anchor
  for (const node of allNodes) {
    if (node.id === anchorNode.id) continue;
    for (const rel of node.relationships) {
      if (rel.type === 'CORRELATED_WITH' &&
          (rel.source === anchorNode.id || rel.target === anchorNode.id) &&
          !correlated.includes(node.id)) {
        correlated.push(node.id);
      }
    }
  }

  return correlated;
}

function findTriggerParent(
  targetId: string,
  allNodes: RuntimeNode[],
  visited: Set<string>
): RuntimeNode | null {
  for (const node of allNodes) {
    if (visited.has(node.id)) continue;
    for (const rel of node.relationships) {
      if ((rel.type === 'TRIGGERED' || rel.type === 'CALLED') && rel.target === targetId) {
        return node;
      }
    }
  }
  return null;
}
