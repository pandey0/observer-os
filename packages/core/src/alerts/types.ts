import type { NodeId, SessionId } from '../types/ids.js';

export type AlertCondition =
  | { type: 'node.status'; status: 'FAILED' | 'DEGRADED' }
  | { type: 'event.severity'; severity: 'ERROR' | 'FATAL' }
  | { type: 'query.duration'; thresholdMs: number };

export type AlertAction =
  | { type: 'webhook'; url: string; secret?: string }
  | { type: 'log' };

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  action: AlertAction;
  enabled: boolean;
  createdAt: number;
}

export interface AlertFire {
  ruleId: string;
  ruleName: string;
  sessionId: SessionId;
  nodeId: NodeId | null;
  eventType: string | null;
  detail: Record<string, unknown>;
  firedAt: number;
}
