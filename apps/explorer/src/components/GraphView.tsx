import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Edge as RFEdge,
  type NodeTypes,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '../store/index.js';
import { applyDagreLayout } from '../utils/layout.js';
import { domainColor } from '../utils/colors.js';
import { RuntimeNodeCard, type RuntimeNodeRF } from './RuntimeNodeCard.js';
import { FilterBar, INITIAL_FILTER, applyFilter, type FilterState } from './FilterBar.js';
import type { RuntimeNode } from '../api/types.js';

// Cast needed: RF NodeTypes variance isn't covariant with generic node data
const nodeTypes = { runtimeNode: RuntimeNodeCard } as unknown as NodeTypes;

export function GraphView() {
  const { nodes: runtimeNodes, events, activeSessionId, wsStatus, replayCursor } = useStore();
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);

  // In replay mode: only show nodes first observed at/before the cursor
  const visibleNodes = useMemo(() => {
    if (replayCursor === null) return runtimeNodes;
    const nodeIdsAtCursor = new Set<string>();
    for (const ev of events) {
      if (ev.occurredAt > replayCursor) break;
      nodeIdsAtCursor.add(ev.sourceNodeId);
    }
    return runtimeNodes.filter((n) => nodeIdsAtCursor.has(n.id));
  }, [runtimeNodes, events, replayCursor]);

  const filteredNodes = useMemo(
    () => applyFilter(visibleNodes, filter),
    [visibleNodes, filter]
  );

  const nodeIdKey = useMemo(
    () => filteredNodes.map((n) => n.id).sort().join(','),
    [filteredNodes]
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RuntimeNodeRF>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const prevNodeIdKeyRef = useRef('');

  useEffect(() => {
    if (filteredNodes.length === 0) {
      setRfNodes([]);
      setRfEdges([]);
      prevNodeIdKeyRef.current = '';
      return;
    }

    const edges = buildEdges(filteredNodes);
    const structureChanged = nodeIdKey !== prevNodeIdKeyRef.current;

    if (structureChanged) {
      const raw: RuntimeNodeRF[] = filteredNodes.map(toRFNode);
      const positioned = applyDagreLayout(raw, edges);
      setRfNodes(positioned);
      setRfEdges(edges);
      prevNodeIdKeyRef.current = nodeIdKey;
    } else {
      setRfNodes((prev) =>
        prev.map((n) => {
          const updated = filteredNodes.find((rn) => rn.id === n.id);
          return updated ? { ...n, data: { node: updated } } : n;
        })
      );
    }
  }, [filteredNodes, nodeIdKey]); // stable refs now via useMemo

  if (!activeSessionId) {
    return <EmptyState icon="◉" title="No session selected" sub="Select or create a session in the left panel" />;
  }

  if (runtimeNodes.length === 0 && wsStatus !== 'connecting') {
    return <EmptyState icon="○" title="No nodes yet" sub="Start your app with the Observer SDK to see the graph" />;
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#060e1a' }}>
      <FilterBar nodes={visibleNodes} filter={filter} onChange={setFilter} />
    <div style={{ flex: 1, position: 'relative' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          style: { stroke: '#334155', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#334155', width: 12, height: 12 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
        <Controls style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
        <MiniMap
          nodeColor={(n) => {
            const d = (n.data as { node?: RuntimeNode } | undefined)?.node;
            return d ? domainColor(d.domain) : '#1e293b';
          }}
          style={{ background: '#0a1628', border: '1px solid #1e293b', borderRadius: '8px' }}
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>

      {wsStatus === 'connecting' && (
        <div style={{
          position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
          background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '8px',
          padding: '6px 16px', color: '#60a5fa', fontSize: '12px', fontFamily: 'monospace',
        }}>
          connecting…
        </div>
      )}
    </div>
    </div>
  );
}

function toRFNode(node: RuntimeNode): RuntimeNodeRF {
  return {
    id: node.id,
    type: 'runtimeNode',
    position: { x: 0, y: 0 },
    data: { node },
  };
}

function buildEdges(nodes: RuntimeNode[]): RFEdge[] {
  const edges: RFEdge[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const rel of node.relationships) {
      if (seen.has(rel.id)) continue;
      seen.add(rel.id);
      const isCorrelated = rel.type === 'CORRELATED_WITH';
      edges.push({
        id: rel.id,
        source: rel.source,
        target: rel.target,
        label: rel.type.replace(/_/g, ' ').toLowerCase(),
        animated: isCorrelated,
        style: {
          stroke: isCorrelated ? '#8b5cf6' : '#334155',
          strokeWidth: isCorrelated ? 2 : 1.5,
        },
        labelStyle: { fill: '#475569', fontSize: '10px', fontFamily: 'monospace' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCorrelated ? '#8b5cf6' : '#334155',
          width: 10, height: 10,
        },
      });
    }
  }
  return edges;
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#060e1a', gap: '8px',
    }}>
      <span style={{ fontSize: '40px', color: '#1e293b' }}>{icon}</span>
      <span style={{ color: '#475569', fontSize: '14px', fontFamily: 'monospace' }}>{title}</span>
      <span style={{ color: '#334155', fontSize: '12px' }}>{sub}</span>
    </div>
  );
}
