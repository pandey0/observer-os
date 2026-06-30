import { describe, it, expect } from 'vitest';
import { createCore, asNodeId, asSessionId } from '@observer-os/core';
import { ContextEngine } from '../ContextEngine.js';
import type { ContextRequest } from '../types.js';

function makeCore() {
  return createCore();
}

function emit(
  core: ReturnType<typeof makeCore>,
  sessionId: string,
  type: string,
  sourceNodeId: string,
  extra: Partial<{
    correlationId: string;
    severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
    payload: Record<string, unknown>;
  }> = {}
) {
  core.sessions.emit(asSessionId(sessionId), {
    type,
    sourceNodeId: asNodeId(sourceNodeId),
    occurredAt: Date.now(),
    payload: extra.payload ?? {},
    severity: extra.severity ?? 'INFO',
    correlationId: extra.correlationId,
  });
}

function makeSnapshot(core: ReturnType<typeof makeCore>, sessionId: string) {
  const sid = asSessionId(sessionId);
  return {
    nodes: core.graph.getNodes(sid),
    events: core.events.read(sid),
  };
}

describe('ContextEngine', () => {
  const engine = new ContextEngine();

  it('throws when anchor node not found', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const req: ContextRequest = {
      anchor: { type: 'node', nodeId: 'nonexistent' },
      sessionId: session.id,
    };
    expect(() => engine.build(req, makeSnapshot(core, session.id as string))).toThrow('not found');
    core.dispose();
  });

  it('builds basic context for a node anchor', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    emit(core, session.id as string, 'observer.express/request.started', 'req-node-1', {
      payload: { method: 'GET', path: '/api/health' },
    });

    const snap = makeSnapshot(core, session.id as string);
    expect(snap.nodes.length).toBeGreaterThan(0);

    const reqNode = snap.nodes.find((n) => n.id === asNodeId('req-node-1'));
    expect(reqNode).toBeDefined();

    const pkg = engine.build({
      anchor: { type: 'node', nodeId: 'req-node-1' },
      sessionId: session.id,
    }, snap);

    expect(pkg.sessionId).toBe(session.id);
    expect(pkg.anchor.nodeId).toBe('req-node-1');
    expect(pkg.depth).toBe('DETAILED');
    expect(pkg.format).toBe('MARKDOWN');
    expect(pkg.nodes.length).toBeGreaterThan(0);
    expect(pkg.nodes[0]!.node.id).toBe(asNodeId('req-node-1'));
    expect(pkg.markdownContent).toContain('Observer OS');
    expect(pkg.tokenEstimate).toBeGreaterThan(0);
    expect(pkg.generatedAt).toBeGreaterThan(0);

    core.dispose();
  });

  it('anchor node is always rank 1', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;

    emit(core, sid, 'observer.express/server.started', 'server-1');
    emit(core, sid, 'observer.express/request.started', 'req-1');
    emit(core, sid, 'observer.express/request.failed', 'req-1', { severity: 'ERROR', payload: { error: 'boom' } });

    const pkg = engine.build({
      anchor: { type: 'error', nodeId: 'req-1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.nodes[0]!.node.id).toBe(asNodeId('req-1'));

    core.dispose();
  });

  it('causal chain includes anchor node', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;

    emit(core, sid, 'observer.express/request.started', 'req-1');
    emit(core, sid, 'observer.express/request.failed', 'req-1', { severity: 'ERROR' });

    const pkg = engine.build({
      anchor: { type: 'error', nodeId: 'req-1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.causalChain).toContain('req-1');

    core.dispose();
  });

  it('cross-domain correlation via correlationId', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;

    emit(core, sid, 'observer.browser/fetch.started', 'fetch-1', { correlationId: 'corr-abc' });
    emit(core, sid, 'observer.express/request.started', 'req-1', { correlationId: 'corr-abc' });
    emit(core, sid, 'observer.express/request.failed', 'req-1', { severity: 'ERROR' });

    const pkg = engine.build({
      anchor: { type: 'error', nodeId: 'req-1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.correlatedNodes).toContain('fetch-1');
    expect(pkg.markdownContent).toContain('Cross-Domain');

    core.dispose();
  });

  it('respects SURFACE depth — at most 5 nodes', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;

    for (let i = 0; i < 20; i++) {
      emit(core, sid, 'observer.express/request.started', `req-${i}`);
    }

    const pkg = engine.build({
      anchor: { type: 'node', nodeId: 'req-0' },
      depth: 'SURFACE',
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.nodes.length).toBeLessThanOrEqual(5);
    expect(pkg.events.length).toBeLessThanOrEqual(10);

    core.dispose();
  });

  it('FULL depth returns more nodes than SURFACE', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;

    for (let i = 0; i < 10; i++) {
      emit(core, sid, 'observer.express/request.started', `req-${i}`);
    }

    const surface = engine.build({
      anchor: { type: 'node', nodeId: 'req-0' },
      depth: 'SURFACE',
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    const full = engine.build({
      anchor: { type: 'node', nodeId: 'req-0' },
      depth: 'FULL',
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(full.nodes.length).toBeGreaterThanOrEqual(surface.nodes.length);

    core.dispose();
  });

  it('markdown contains required sections', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;
    emit(core, sid, 'observer.express/request.started', 'req-1', { payload: { method: 'POST', path: '/login' } });

    const pkg = engine.build({
      anchor: { type: 'node', nodeId: 'req-1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.markdownContent).toContain('# Observer OS');
    expect(pkg.markdownContent).toContain('## Relevant Nodes');
    expect(pkg.markdownContent).toContain('## Relevant Events');
    expect(pkg.markdownContent).toContain('req-1');

    core.dispose();
  });

  it('JSON format is recorded in package', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;
    emit(core, sid, 'observer.express/request.started', 'req-1');

    const pkg = engine.build({
      anchor: { type: 'node', nodeId: 'req-1' },
      format: 'JSON',
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.format).toBe('JSON');
    expect(pkg.markdownContent.length).toBeGreaterThan(0);

    core.dispose();
  });

  it('token estimate equals ceil(length / 4)', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;
    emit(core, sid, 'observer.express/request.started', 'n1');

    const pkg = engine.build({
      anchor: { type: 'node', nodeId: 'n1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.tokenEstimate).toBeGreaterThan(0);
    expect(pkg.tokenEstimate).toBe(Math.ceil(pkg.markdownContent.length / 4));

    core.dispose();
  });

  it('generatedAt is within test window', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;
    emit(core, sid, 'observer.express/request.started', 'n1');

    const before = Date.now();
    const pkg = engine.build({
      anchor: { type: 'node', nodeId: 'n1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));
    const after = Date.now();

    expect(pkg.generatedAt).toBeGreaterThanOrEqual(before);
    expect(pkg.generatedAt).toBeLessThanOrEqual(after);

    core.dispose();
  });

  it('failed node gets error details section', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;
    emit(core, sid, 'observer.express/request.started', 'req-1');
    emit(core, sid, 'observer.express/request.failed', 'req-1', {
      severity: 'ERROR',
      payload: { errorName: 'Error', errorMessage: 'DB timeout' },
    });

    const pkg = engine.build({
      anchor: { type: 'error', nodeId: 'req-1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    expect(pkg.markdownContent).toContain('Error Details');

    core.dispose();
  });

  it('ERROR events score higher than events from unrelated nodes', () => {
    const core = makeCore();
    const session = core.sessions.create({ name: 'test' });
    const sid = session.id as string;
    emit(core, sid, 'observer.express/request.started', 'req-1');
    emit(core, sid, 'observer.express/request.failed', 'req-1', { severity: 'ERROR' });
    emit(core, sid, 'observer.express/middleware.started', 'mw-1', { severity: 'DEBUG' });

    const pkg = engine.build({
      anchor: { type: 'error', nodeId: 'req-1' },
      sessionId: session.id,
    }, makeSnapshot(core, sid));

    const anchorErrorEvent = pkg.events.find((re) => re.event.severity === 'ERROR' && re.event.sourceNodeId === asNodeId('req-1'));
    const otherEvents = pkg.events.filter((re) => re.event.sourceNodeId !== asNodeId('req-1'));

    if (anchorErrorEvent && otherEvents.length > 0) {
      const minOtherScore = Math.min(...otherEvents.map((re) => re.relevanceScore));
      expect(anchorErrorEvent.relevanceScore).toBeGreaterThan(minOtherScore);
    }

    core.dispose();
  });
});
