import { describe, it, expect, vi } from 'vitest';
import { wrapExecute } from '../instrumentation/wrapExecute.js';
import { GRAPHQL_EVENTS } from '../node-types.js';
import { GraphQLPlugin } from '../GraphQLPlugin.js';
import type { ObserverSDK } from '@observer-os/sdk';
import type { ExecuteFn } from '../instrumentation/wrapExecute.js';

function makeSdk() {
  const emitted: Parameters<ObserverSDK['emit']>[0][] = [];
  return {
    sdk: {
      emit: vi.fn((e) => emitted.push(e)),
      isConnected: vi.fn(() => true),
      generateNodeId: vi.fn((k: string) => k),
    } as unknown as ObserverSDK,
    emitted,
  };
}

function makeDoc(operation = 'query', name?: string) {
  return {
    definitions: [{
      kind: 'OperationDefinition',
      operation,
      ...(name ? { name: { value: name } } : {}),
    }],
  };
}

describe('wrapExecute', () => {
  it('emits OPERATION_STARTED on call', async () => {
    const { sdk, emitted } = makeSdk();
    const mockExecute = vi.fn().mockResolvedValue({ data: {} }) as ExecuteFn;
    const wrapped = wrapExecute(mockExecute, sdk);
    await wrapped({ schema: {}, document: makeDoc('query', 'GetUsers') });
    expect(emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_STARTED)).toBeDefined();
  });

  it('emits OPERATION_COMPLETED on success', async () => {
    const { sdk, emitted } = makeSdk();
    const wrapped = wrapExecute(vi.fn().mockResolvedValue({ data: {} }) as ExecuteFn, sdk);
    await wrapped({ schema: {}, document: makeDoc('query', 'GetUsers') });
    expect(emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_COMPLETED)).toBeDefined();
  });

  it('emits OPERATION_FAILED when result has errors', async () => {
    const { sdk, emitted } = makeSdk();
    const wrapped = wrapExecute(vi.fn().mockResolvedValue({ data: null, errors: [{ message: 'not found' }] }) as ExecuteFn, sdk);
    await wrapped({ schema: {}, document: makeDoc('query', 'GetUser') });
    const ev = emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_FAILED);
    expect(ev).toBeDefined();
    expect(ev?.payload?.['errorCount']).toBe(1);
  });

  it('emits OPERATION_FAILED and rethrows on thrown exception', async () => {
    const { sdk, emitted } = makeSdk();
    const wrapped = wrapExecute(vi.fn().mockRejectedValue(new Error('schema error')) as ExecuteFn, sdk);
    await expect(wrapped({ schema: {}, document: makeDoc() })).rejects.toThrow('schema error');
    expect(emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_FAILED)).toBeDefined();
  });

  it('payload has operationName, operationType, duration, durationMs', async () => {
    const { sdk, emitted } = makeSdk();
    const wrapped = wrapExecute(vi.fn().mockResolvedValue({ data: {} }) as ExecuteFn, sdk);
    await wrapped({ schema: {}, document: makeDoc('query', 'GetUsers') });
    const ev = emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_COMPLETED);
    expect(ev?.payload?.['operationName']).toBe('GetUsers');
    expect(ev?.payload?.['operationType']).toBe('query');
    expect(typeof ev?.payload?.['duration']).toBe('number');
    expect(typeof ev?.payload?.['durationMs']).toBe('number');
  });

  it('anonymous query: operationName is null in STARTED payload', async () => {
    const { sdk, emitted } = makeSdk();
    const wrapped = wrapExecute(vi.fn().mockResolvedValue({ data: {} }) as ExecuteFn, sdk);
    await wrapped({ schema: {}, document: makeDoc('query') });
    expect(emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_STARTED)?.payload?.['operationName']).toBeNull();
  });

  it('mutation type detected', async () => {
    const { sdk, emitted } = makeSdk();
    const wrapped = wrapExecute(vi.fn().mockResolvedValue({ data: {} }) as ExecuteFn, sdk);
    await wrapped({ schema: {}, document: makeDoc('mutation', 'CreateUser') });
    expect(emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_STARTED)?.payload?.['operationType']).toBe('mutation');
  });

  it('getCorrelationId option overrides ALS', async () => {
    const { sdk, emitted } = makeSdk();
    const wrapped = wrapExecute(vi.fn().mockResolvedValue({ data: {} }) as ExecuteFn, sdk, { getCorrelationId: () => 'my-corr' });
    await wrapped({ schema: {}, document: makeDoc() });
    expect(emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_STARTED)?.correlationId).toBe('my-corr');
  });

  it('errors array capped at 5 in payload', async () => {
    const { sdk, emitted } = makeSdk();
    const errors = Array.from({ length: 10 }, (_, i) => ({ message: `err ${i}` }));
    const wrapped = wrapExecute(vi.fn().mockResolvedValue({ data: null, errors }) as ExecuteFn, sdk);
    await wrapped({ schema: {}, document: makeDoc() });
    expect(emitted.find(e => e.type === GRAPHQL_EVENTS.OPERATION_FAILED)?.payload?.['errors']).toHaveLength(5);
  });
});

describe('GraphQLPlugin', () => {
  it('dispose clears wrappedExecute', () => {
    const { sdk } = makeSdk();
    const plugin = new GraphQLPlugin(sdk);
    plugin.instrument(vi.fn() as unknown as ExecuteFn);
    plugin.dispose();
    expect((plugin as unknown as { wrappedExecute: null }).wrappedExecute).toBeNull();
  });

  it('instrument returns a function', () => {
    const { sdk } = makeSdk();
    const plugin = new GraphQLPlugin(sdk);
    const result = plugin.instrument(vi.fn() as unknown as ExecuteFn);
    expect(typeof result).toBe('function');
  });
});
