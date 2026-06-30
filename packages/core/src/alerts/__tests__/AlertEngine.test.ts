import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertEngine } from '../AlertEngine.js';
import type { RuntimeNode } from '../../types/node.js';
import type { RuntimeEvent } from '../../types/event.js';
import { newNodeId, newEventId, newSessionId, newWorkspaceId } from '../../utils/id.js';

function makeNode(overrides: Partial<RuntimeNode> = {}): RuntimeNode {
  return {
    id: newNodeId(),
    type: 'observer.test/Node',
    domain: 'test' as never,
    label: 'Test',
    status: 'ACTIVE',
    capabilities: [],
    relationships: [],
    metadata: {},
    payload: {},
    sessionId: newSessionId(),
    workspaceId: newWorkspaceId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    schemaVersion: '1.0.0',
    ...overrides,
  } as unknown as RuntimeNode;
}

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: newEventId(),
    type: 'observer.test/event',
    sourceNodeId: newNodeId(),
    affectedNodeIds: [],
    occurredAt: Date.now(),
    recordedAt: Date.now(),
    sequenceNumber: 1,
    payload: {},
    sessionId: newSessionId(),
    workspaceId: newWorkspaceId(),
    severity: 'INFO',
    schemaVersion: '1.0.0',
    ...overrides,
  } as unknown as RuntimeEvent;
}

describe('AlertEngine', () => {
  let engine: AlertEngine;

  beforeEach(() => { engine = new AlertEngine(); });

  it('creates and lists rules', () => {
    const rule = engine.addRule({
      name: 'fail alert',
      condition: { type: 'node.status', status: 'FAILED' },
      action: { type: 'log' },
      enabled: true,
    });
    expect(rule.id).toBeTruthy();
    expect(engine.listRules()).toHaveLength(1);
  });

  it('removes rule', () => {
    const rule = engine.addRule({ name: 'r', condition: { type: 'node.status', status: 'FAILED' }, action: { type: 'log' }, enabled: true });
    expect(engine.removeRule(rule.id)).toBe(true);
    expect(engine.listRules()).toHaveLength(0);
  });

  it('updates rule', () => {
    const rule = engine.addRule({ name: 'r', condition: { type: 'node.status', status: 'FAILED' }, action: { type: 'log' }, enabled: true });
    const updated = engine.updateRule(rule.id, { enabled: false });
    expect(updated?.enabled).toBe(false);
  });

  it('fires on matching node status', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    engine.addRule({
      name: 'node fail',
      condition: { type: 'node.status', status: 'FAILED' },
      action: { type: 'log' },
      enabled: true,
    });
    const node = makeNode({ status: 'FAILED' });
    engine.evaluateNode(node, node.sessionId);
    expect(engine.listFires()).toHaveLength(1);
    expect(engine.listFires().at(0)?.ruleName).toBe('node fail');
    logSpy.mockRestore();
  });

  it('does not fire when node status does not match', () => {
    engine.addRule({ name: 'r', condition: { type: 'node.status', status: 'FAILED' }, action: { type: 'log' }, enabled: true });
    engine.evaluateNode(makeNode({ status: 'ACTIVE' }), newSessionId());
    expect(engine.listFires()).toHaveLength(0);
  });

  it('fires on event.severity >= ERROR', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    engine.addRule({
      name: 'err alert',
      condition: { type: 'event.severity', severity: 'ERROR' },
      action: { type: 'log' },
      enabled: true,
    });
    engine.evaluateEvent(makeEvent({ severity: 'ERROR' }));
    engine.evaluateEvent(makeEvent({ severity: 'FATAL' }));
    engine.evaluateEvent(makeEvent({ severity: 'WARN' }));  // should not fire
    expect(engine.listFires()).toHaveLength(2);
    logSpy.mockRestore();
  });

  it('fires on query.duration threshold', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    engine.addRule({
      name: 'slow query',
      condition: { type: 'query.duration', thresholdMs: 100 },
      action: { type: 'log' },
      enabled: true,
    });
    engine.evaluateEvent(makeEvent({ payload: { duration: 150 } }));
    engine.evaluateEvent(makeEvent({ payload: { duration: 50 } }));
    expect(engine.listFires()).toHaveLength(1);
    logSpy.mockRestore();
  });

  it('skips disabled rules', () => {
    engine.addRule({ name: 'r', condition: { type: 'node.status', status: 'FAILED' }, action: { type: 'log' }, enabled: false });
    engine.evaluateNode(makeNode({ status: 'FAILED' }), newSessionId());
    expect(engine.listFires()).toHaveLength(0);
  });

  it('respects listFires limit', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    engine.addRule({ name: 'r', condition: { type: 'event.severity', severity: 'ERROR' }, action: { type: 'log' }, enabled: true });
    for (let i = 0; i < 10; i++) engine.evaluateEvent(makeEvent({ severity: 'ERROR' }));
    expect(engine.listFires(3)).toHaveLength(3);
    logSpy.mockRestore();
  });
});
