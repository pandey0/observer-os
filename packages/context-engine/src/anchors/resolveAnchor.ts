import type { RuntimeNode } from '@observer-os/core';
import type { AnchorType } from '../types.js';

const ERROR_STATUSES = new Set(['FAILED']);
const ERROR_EVENT_SUFFIXES = ['.failed', '.errored', '.exception', '.error', 'exception', 'rejection'];

/**
 * Resolve the anchor node from the graph.
 * For 'error' anchor: nodeId is used directly (the caller should ensure it's an error node).
 * For 'node' anchor: nodeId is used directly.
 * Returns null if node not found.
 */
export function resolveAnchorNode(
  nodeId: string,
  anchorType: AnchorType,
  allNodes: RuntimeNode[]
): RuntimeNode | null {
  const node = allNodes.find((n) => n.id === nodeId) ?? null;
  if (!node) return null;

  if (anchorType === 'error') {
    // Validate it's actually an error node — surface warning but still return
    if (!ERROR_STATUSES.has(node.status) && !isErrorEventType(node.type)) {
      // Best-effort: still proceed with whatever node the caller anchored on
    }
  }

  return node;
}

/**
 * Given an error node, find the most relevant error node for anchoring.
 * If the specified node is not in FAILED status, walk relationships to find one.
 */
export function findBestErrorAnchor(
  nodeId: string,
  allNodes: RuntimeNode[]
): RuntimeNode | null {
  const node = allNodes.find((n) => n.id === nodeId) ?? null;
  if (!node) return null;

  if (node.status === 'FAILED') return node;

  // Walk TRIGGERED/CALLED relationships to find a FAILED descendant
  const visited = new Set<string>();
  const queue = [node];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    for (const rel of current.relationships) {
      if (rel.type === 'TRIGGERED' || rel.type === 'CALLED' || rel.type === 'FAILED') {
        const target = allNodes.find((n) => n.id === rel.target);
        if (target && !visited.has(target.id)) {
          if (target.status === 'FAILED') return target;
          queue.push(target);
        }
      }
    }
  }

  return node; // Fallback to original
}

function isErrorEventType(type: string): boolean {
  const lower = type.toLowerCase();
  return ERROR_EVENT_SUFFIXES.some((s) => lower.endsWith(s) || lower.includes(s));
}
