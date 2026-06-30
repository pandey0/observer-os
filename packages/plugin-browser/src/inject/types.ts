// Browser-side types (no Node.js deps)

export interface BrowserEmitPayload {
  type: string;
  sourceNodeId: string;
  occurredAt: number;
  payload: Record<string, unknown>;
  correlationId?: string;
  causedByEventId?: string;
  severity?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  schemaVersion?: string;
}

export interface ObserverConfig {
  sessionId: string;
  bridgeUrl: string;
  disabled?: boolean;
}
