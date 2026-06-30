import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createObserverExtension, type PrismaPluginOptions } from '../instrumentation/observerExtension.js';
import { PRISMA_EVENTS } from '../node-types.js';
import type { ObserverSDK } from '@observer-os/sdk';

function makeSdk() {
  const emitted: Parameters<ObserverSDK['emit']>[0][] = [];
  return {
    sdk: {
      emit: vi.fn((e) => emitted.push(e)),
      isConnected: vi.fn(() => true),
      generateNodeId: vi.fn((k) => k),
    } as unknown as ObserverSDK,
    emitted,
  };
}

function getOps(sdk: ObserverSDK, options?: PrismaPluginOptions) {
  const ext = createObserverExtension(sdk, options);
  return ext.query.$allModels.$allOperations.bind(ext.query.$allModels);
}

describe('PrismaPlugin — createObserverExtension', () => {
  it('emits QUERY_STARTED on operation start', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    await ops({ model: 'User', operation: 'findMany', args: { where: {} }, query: vi.fn().mockResolvedValue([]) });
    expect(emitted.find(e => e.type === PRISMA_EVENTS.QUERY_STARTED)).toBeDefined();
  });

  it('emits QUERY_COMPLETED on success', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    await ops({ model: 'User', operation: 'findMany', args: {}, query: vi.fn().mockResolvedValue([{ id: 1 }]) });
    expect(emitted.find(e => e.type === PRISMA_EVENTS.QUERY_COMPLETED)).toBeDefined();
  });

  it('emits QUERY_FAILED with severity ERROR on failure', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    const err = new Error('DB connection failed');
    await expect(ops({ model: 'Post', operation: 'create', args: {}, query: vi.fn().mockRejectedValue(err) })).rejects.toThrow();
    const failEvent = emitted.find(e => e.type === PRISMA_EVENTS.QUERY_FAILED);
    expect(failEvent?.severity).toBe('ERROR');
  });

  it('QUERY_FAILED re-throws original error', async () => {
    const { sdk } = makeSdk();
    const ops = getOps(sdk);
    const err = new Error('unique constraint');
    await expect(ops({ model: 'User', operation: 'create', args: {}, query: vi.fn().mockRejectedValue(err) })).rejects.toThrow('unique constraint');
  });

  it('COMPLETED payload has model, operation, duration, durationMs', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    await ops({ model: 'Order', operation: 'findUnique', args: {}, query: vi.fn().mockResolvedValue({ id: 1 }) });
    const ev = emitted.find(e => e.type === PRISMA_EVENTS.QUERY_COMPLETED);
    expect(ev?.payload?.['model']).toBe('Order');
    expect(ev?.payload?.['operation']).toBe('findUnique');
    expect(typeof ev?.payload?.['duration']).toBe('number');
    expect(typeof ev?.payload?.['durationMs']).toBe('number');
  });

  it('resultCount is array.length for array result', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    await ops({ model: 'User', operation: 'findMany', args: {}, query: vi.fn().mockResolvedValue([{}, {}, {}]) });
    expect(emitted.find(e => e.type === PRISMA_EVENTS.QUERY_COMPLETED)?.payload?.['resultCount']).toBe(3);
  });

  it('resultCount is 1 for single object result', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    await ops({ model: 'User', operation: 'findUnique', args: {}, query: vi.fn().mockResolvedValue({ id: 1 }) });
    expect(emitted.find(e => e.type === PRISMA_EVENTS.QUERY_COMPLETED)?.payload?.['resultCount']).toBe(1);
  });

  it('resultCount is 0 for null result', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    await ops({ model: 'User', operation: 'findUnique', args: {}, query: vi.fn().mockResolvedValue(null) });
    expect(emitted.find(e => e.type === PRISMA_EVENTS.QUERY_COMPLETED)?.payload?.['resultCount']).toBe(0);
  });

  it('STARTED payload has argKeys (not full args — PII safe)', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    await ops({ model: 'User', operation: 'create', args: { data: { email: 'a@b.com', password: 'secret' }, select: { id: true } }, query: vi.fn().mockResolvedValue({ id: 1 }) });
    const ev = emitted.find(e => e.type === PRISMA_EVENTS.QUERY_STARTED);
    expect(ev?.payload?.['argKeys']).toContain('data');
    expect(ev?.payload?.['argKeys']).toContain('select');
    expect(JSON.stringify(ev?.payload ?? {})).not.toContain('secret');
  });

  it('getCorrelationId option takes precedence over ALS', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk, { getCorrelationId: () => 'custom-corr-id' });
    await ops({ model: 'User', operation: 'findMany', args: {}, query: vi.fn().mockResolvedValue([]) });
    expect(emitted.find(e => e.type === PRISMA_EVENTS.QUERY_STARTED)?.correlationId).toBe('custom-corr-id');
  });

  it('FAILED payload has errorName and errorMessage', async () => {
    const { sdk, emitted } = makeSdk();
    const ops = getOps(sdk);
    const err = new TypeError('bad input');
    await expect(ops({ model: 'User', operation: 'update', args: {}, query: vi.fn().mockRejectedValue(err) })).rejects.toThrow();
    const ev = emitted.find(e => e.type === PRISMA_EVENTS.QUERY_FAILED);
    expect(ev?.payload?.['errorName']).toBe('TypeError');
    expect(ev?.payload?.['errorMessage']).toBe('bad input');
  });
});
