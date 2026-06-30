import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCore, asWorkspaceId } from '@observer-os/core';
import { PluginSDKImpl } from '@observer-os/sdk';
import type { SessionInfo } from '@observer-os/sdk';
import { patchFetch } from '../instrumentation/fetchWrapper.js';
import { NEXTJS_EVENTS } from '../node-types.js';

const WS = asWorkspaceId('ws_fetch_test');

function makeCtx() {
  const core = createCore(WS);
  const session = core.sessions.create({ name: 'Fetch test' });
  const info: SessionInfo = {
    id: session.id,
    workspaceId: session.workspaceId,
    name: session.name,
    startedAt: session.startedAt,
  };
  const sdk = new PluginSDKImpl(core.sessions, info, 'observer.nextjs', {});
  sdk.markConnected();
  return { core, session, sdk };
}

describe('patchFetch', () => {
  const g = globalThis as Record<string, unknown>;
  let savedFetch: unknown;
  let unpatch: (() => void) | null = null;

  beforeEach(() => {
    savedFetch = g['fetch'];
  });

  afterEach(() => {
    unpatch?.();
    unpatch = null;
    // Restore whatever was there before the test
    g['fetch'] = savedFetch;
  });

  it('emits FETCH_STARTED and FETCH_COMPLETED on a successful fetch', async () => {
    const { core, session, sdk } = makeCtx();

    const mockResponse = { status: 200, ok: true } as Response;
    g['fetch'] = vi.fn().mockResolvedValue(mockResponse);

    unpatch = patchFetch(sdk);

    const fetchFn = g['fetch'] as typeof fetch;
    await fetchFn('https://api.example.com/users');

    const types = core.events.read(session.id).map(e => e.type);
    expect(types).toContain(NEXTJS_EVENTS.FETCH_STARTED);
    expect(types).toContain(NEXTJS_EVENTS.FETCH_COMPLETED);
    expect(types).not.toContain(NEXTJS_EVENTS.FETCH_FAILED);
  });

  it('records url and method in FETCH_STARTED payload', async () => {
    const { core, session, sdk } = makeCtx();

    g['fetch'] = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    unpatch = patchFetch(sdk);

    const fetchFn = g['fetch'] as typeof fetch;
    await fetchFn('https://api.example.com/items', { method: 'POST' });

    const events = core.events.read(session.id);
    const startEvent = events.find(e => e.type === NEXTJS_EVENTS.FETCH_STARTED)!;
    const payload = startEvent.payload as Record<string, unknown>;
    expect(payload['url']).toBe('https://api.example.com/items');
    expect(payload['method']).toBe('POST');
  });

  it('emits FETCH_STARTED and FETCH_FAILED when fetch throws', async () => {
    const { core, session, sdk } = makeCtx();

    g['fetch'] = vi.fn().mockRejectedValue(new Error('network unreachable'));
    unpatch = patchFetch(sdk);

    const fetchFn = g['fetch'] as typeof fetch;
    await expect(fetchFn('https://api.example.com/data')).rejects.toThrow('network unreachable');

    const types = core.events.read(session.id).map(e => e.type);
    expect(types).toContain(NEXTJS_EVENTS.FETCH_STARTED);
    expect(types).toContain(NEXTJS_EVENTS.FETCH_FAILED);
    expect(types).not.toContain(NEXTJS_EVENTS.FETCH_COMPLETED);
  });

  it('FETCH_FAILED event carries error message and severity ERROR', async () => {
    const { core, session, sdk } = makeCtx();

    g['fetch'] = vi.fn().mockRejectedValue(new Error('timeout'));
    unpatch = patchFetch(sdk);

    const fetchFn = g['fetch'] as typeof fetch;
    await fetchFn('https://api.example.com/data').catch(() => {});

    const events = core.events.read(session.id);
    const failEvent = events.find(e => e.type === NEXTJS_EVENTS.FETCH_FAILED)!;
    expect(failEvent.severity).toBe('ERROR');
    expect((failEvent.payload as Record<string, unknown>)['error']).toBe('timeout');
  });

  it('stops emitting events after unpatch is called', async () => {
    const { core, session, sdk } = makeCtx();

    const mockImpl = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    g['fetch'] = mockImpl;

    const doUnpatch = patchFetch(sdk);
    // Immediately unpatch — fetch is back to the mock without instrumentation
    doUnpatch();

    const fetchFn = g['fetch'] as typeof fetch;
    await fetchFn('https://api.example.com/after-unpatch');

    // The mock was called but no observer events emitted
    expect(mockImpl).toHaveBeenCalledOnce();
    expect(core.events.read(session.id)).toHaveLength(0);
  });

  it('wraps whatever fetch is at call time (chains with a prior patch)', async () => {
    const { core, session, sdk } = makeCtx();

    // Simulate Next.js having already replaced fetch with its own version
    const nextjsPatchedFetch = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    g['fetch'] = nextjsPatchedFetch;

    // Now our plugin patches on top
    unpatch = patchFetch(sdk);

    const fetchFn = g['fetch'] as typeof fetch;
    await fetchFn('https://api.example.com/data');

    // Observer events emitted AND the Next.js patched version was called
    const types = core.events.read(session.id).map(e => e.type);
    expect(types).toContain(NEXTJS_EVENTS.FETCH_STARTED);
    expect(types).toContain(NEXTJS_EVENTS.FETCH_COMPLETED);
    expect(nextjsPatchedFetch).toHaveBeenCalledOnce();
  });
});
