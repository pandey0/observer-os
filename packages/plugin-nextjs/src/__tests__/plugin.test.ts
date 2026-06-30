import { describe, it, expect } from 'vitest';
import { createCore, asWorkspaceId } from '@observer-os/core';
import { PluginSDKImpl } from '@observer-os/sdk';
import type { SessionInfo } from '@observer-os/sdk';
import { withObserver } from '../routers/pagesRouter.js';
import { withObserverMiddleware } from '../routers/edgeMiddleware.js';
import { NEXTJS_EVENTS } from '../node-types.js';

const WS = asWorkspaceId('ws_nextjs_test');

function makeCtx() {
  const core = createCore(WS);
  const session = core.sessions.create({ name: 'Next.js test' });
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

// ─── withObserver (pagesRouter) ───────────────────────────────────────────────

describe('withObserver — pagesRouter', () => {
  it('emits GSSP_STARTED and GSSP_COMPLETED for getServerSideProps', async () => {
    const { core, session, sdk } = makeCtx();

    const handler = async (_ctx: unknown) => ({ props: { greeting: 'hello' } });
    const wrapped = withObserver(handler, sdk, 'gssp');

    await wrapped({ req: { headers: {} }, res: {}, query: {} });

    const types = core.events.read(session.id).map(e => e.type);
    expect(types).toContain(NEXTJS_EVENTS.GSSP_STARTED);
    expect(types).toContain(NEXTJS_EVENTS.GSSP_COMPLETED);
    expect(types).not.toContain(NEXTJS_EVENTS.GSP_STARTED);
  });

  it('emits GSP_STARTED and GSP_COMPLETED for getStaticProps', async () => {
    const { core, session, sdk } = makeCtx();

    const handler = async (_ctx: unknown) => ({ props: { items: [] } });
    const wrapped = withObserver(handler, sdk, 'gsp');

    await wrapped({});

    const types = core.events.read(session.id).map(e => e.type);
    expect(types).toContain(NEXTJS_EVENTS.GSP_STARTED);
    expect(types).toContain(NEXTJS_EVENTS.GSP_COMPLETED);
    expect(types).not.toContain(NEXTJS_EVENTS.GSSP_STARTED);
  });

  it('returns the value from the underlying handler', async () => {
    const { sdk } = makeCtx();
    const expected = { props: { data: 42 } };
    const handler = async (_ctx: unknown) => expected;
    const wrapped = withObserver(handler, sdk, 'gssp');

    const result = await wrapped({});
    expect(result).toEqual(expected);
  });

  it('extracts correlationId from x-observer-trace-id request header', async () => {
    const { core, session, sdk } = makeCtx();

    const handler = async (_ctx: unknown) => ({});
    const wrapped = withObserver(handler, sdk, 'gssp');

    await wrapped({ req: { headers: { 'x-observer-trace-id': 'trace-abc' } } });

    const events = core.events.read(session.id);
    const startEvent = events.find(e => e.type === NEXTJS_EVENTS.GSSP_STARTED)!;
    expect((startEvent as unknown as Record<string, unknown>)['correlationId']).toBe('trace-abc');
  });

  it('propagates errors from the handler without swallowing them', async () => {
    const { sdk } = makeCtx();
    const handler = async (_ctx: unknown): Promise<never> => {
      throw new Error('gssp boom');
    };
    const wrapped = withObserver(handler, sdk, 'gssp');

    await expect(wrapped({})).rejects.toThrow('gssp boom');
  });
});

// ─── withObserverMiddleware (edgeMiddleware) ──────────────────────────────────

describe('withObserverMiddleware — edgeMiddleware', () => {
  it('emits MIDDLEWARE_INVOKED and MIDDLEWARE_COMPLETED on success', async () => {
    const { core, session, sdk } = makeCtx();

    const middleware = async (_req: unknown) => ({ status: 200 });
    const wrapped = withObserverMiddleware(middleware, sdk);

    await wrapped({ url: 'https://example.com', method: 'GET' });

    const types = core.events.read(session.id).map(e => e.type);
    expect(types).toContain(NEXTJS_EVENTS.MIDDLEWARE_INVOKED);
    expect(types).toContain(NEXTJS_EVENTS.MIDDLEWARE_COMPLETED);
  });

  it('returns the value produced by the middleware', async () => {
    const { sdk } = makeCtx();
    const response = { redirectTo: '/login' };
    const middleware = async (_req: unknown) => response;
    const wrapped = withObserverMiddleware(middleware, sdk);

    const result = await wrapped({});
    expect(result).toEqual(response);
  });

  it('re-throws errors from the middleware', async () => {
    const { sdk } = makeCtx();
    const middleware = async (_req: unknown): Promise<never> => {
      throw new Error('middleware error');
    };
    const wrapped = withObserverMiddleware(middleware, sdk);

    await expect(wrapped({})).rejects.toThrow('middleware error');
  });

  it('works with synchronous middleware functions', async () => {
    const { core, session, sdk } = makeCtx();
    const middleware = (_req: unknown) => ({ ok: true });
    const wrapped = withObserverMiddleware(middleware, sdk);

    await wrapped({});

    const types = core.events.read(session.id).map(e => e.type);
    expect(types).toContain(NEXTJS_EVENTS.MIDDLEWARE_INVOKED);
    expect(types).toContain(NEXTJS_EVENTS.MIDDLEWARE_COMPLETED);
  });
});
