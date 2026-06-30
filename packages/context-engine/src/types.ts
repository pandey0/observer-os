import type { RuntimeNode, RuntimeEvent, SessionId } from '@observer-os/core';

export type AnchorType = 'error' | 'node';
export type DepthLevel = 'SURFACE' | 'DETAILED' | 'FULL';
export type OutputFormat = 'MARKDOWN' | 'JSON';

export interface ContextRequest {
  readonly anchor: { readonly type: AnchorType; readonly nodeId: string };
  readonly depth?: DepthLevel;
  readonly format?: OutputFormat;
  readonly sessionId: SessionId;
}

export interface RankedNode {
  readonly node: RuntimeNode;
  readonly relevanceScore: number;
  readonly rank: number;
  readonly reason: string;
}

export interface RankedEvent {
  readonly event: RuntimeEvent;
  readonly relevanceScore: number;
  readonly rank: number;
}

export interface SourceFrame {
  readonly fn: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface ContextPackage {
  readonly sessionId: SessionId;
  readonly anchor: { readonly type: AnchorType; readonly nodeId: string };
  readonly depth: DepthLevel;
  readonly format: OutputFormat;
  readonly tokenEstimate: number;
  readonly nodes: RankedNode[];
  readonly events: RankedEvent[];
  readonly causalChain: string[];      // ordered root → anchor
  readonly correlatedNodes: string[];  // IDs of cross-domain correlated nodes
  readonly sourceFrames: SourceFrame[]; // parsed stack frames from anchor error
  readonly markdownContent: string;
  readonly generatedAt: number;
}
