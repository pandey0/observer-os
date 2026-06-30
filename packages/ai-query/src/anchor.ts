import type { RuntimeNode } from '@observer-os/core';

const ERROR_TERMS = /error|fail|crash|why|broken/i;

/**
 * Select the most relevant anchor node for a given question.
 *
 * Scoring:
 * - +1 for each question token that appears in node.type + node.domain + node.status (case-insensitive)
 * - +10 boost if node.status === 'FAILED' AND question contains an error-intent keyword
 *
 * Tie-break: most recently created node wins (highest createdAt).
 * Returns null if nodes array is empty.
 */
export function selectAnchorNode(question: string, nodes: RuntimeNode[]): RuntimeNode | null {
  if (nodes.length === 0) return null;

  const tokens = question.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const isErrorQuestion = ERROR_TERMS.test(question);

  let bestNode: RuntimeNode | null = null;
  let bestScore = -1;

  for (const node of nodes) {
    const searchText = `${node.type} ${node.domain} ${node.status}`.toLowerCase();

    let score = 0;
    for (const token of tokens) {
      if (searchText.includes(token)) score += 1;
    }

    if (node.status === 'FAILED' && isErrorQuestion) {
      score += 10;
    }

    if (
      score > bestScore ||
      (score === bestScore && bestNode !== null && node.createdAt > bestNode.createdAt)
    ) {
      bestScore = score;
      bestNode = node;
    }
  }

  return bestNode;
}
