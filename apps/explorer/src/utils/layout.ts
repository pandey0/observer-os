import dagre from '@dagrejs/dagre';
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

const NODE_W = 210;
const NODE_H = 88;

export function applyDagreLayout<T extends RFNode>(nodes: T[], edges: RFEdge[]): T[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });

  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}
