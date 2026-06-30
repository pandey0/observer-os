import { describe, it, expect, vi, afterEach } from 'vitest';
import * as http from 'node:http';
import { patchHttp } from '../instrumentation/patchHttp.js';

// Make node:http and node:https plain writable objects so monkey-patching works
// in ESM mode (Module Namespace Exotic Objects are non-writable in Node 22+).
vi.mock('node:http', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:http')>();
  return { ...mod };
});
vi.mock('node:https', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:https')>();
  return { ...mod };
});
import { HttpPlugin } from '../HttpPlugin.js';
import { HTTP_EVENTS } from '../node-types.js';
import type { ObserverSDK } from '@observer-os/sdk';

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

// Build a minimal fake request that emits events
function makeReq() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = {
    on(event: string, fn: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(fn);
      return req;
    },
    emit(event: string, ...args: unknown[]) {
      listeners[event]?.forEach(fn => fn(...args));
    },
    listeners,
  };
  return req;
}

describe('patchHttp', () => {
  let unpatch: (() => void) | undefined;
  const { sdk, emitted } = makeSdk();

  afterEach(() => {
    unpatch?.();
    unpatch = undefined;
    emitted.length = 0;
  });

  it('emits REQUEST_STARTED when request created', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);

    http.request('http://example.com/api');
    expect(emitted.find(e => e.type === HTTP_EVENTS.REQUEST_STARTED)).toBeDefined();
  });

  it('emits REQUEST_COMPLETED when response fires with 200', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);

    http.request('http://example.com/');
    req.emit('response', { statusCode: 200 });
    expect(emitted.find(e => e.type === HTTP_EVENTS.REQUEST_COMPLETED)).toBeDefined();
  });

  it('emits REQUEST_FAILED when response fires with 500', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);

    http.request('http://api.example.com/data');
    req.emit('response', { statusCode: 500 });
    const ev = emitted.find(e => e.type === HTTP_EVENTS.REQUEST_FAILED);
    expect(ev?.severity).toBe('ERROR');
  });

  it('emits REQUEST_FAILED on error event', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);

    http.request('http://example.com/');
    req.emit('error', new Error('ECONNREFUSED'));
    expect(emitted.find(e => e.type === HTTP_EVENTS.REQUEST_FAILED)).toBeDefined();
  });

  it('payload has method, host, path, protocol, statusCode, duration, durationMs', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);

    http.request('http://example.com/path?q=1');
    req.emit('response', { statusCode: 200 });
    const ev = emitted.find(e => e.type === HTTP_EVENTS.REQUEST_COMPLETED);
    expect(ev?.payload?.['method']).toBe('GET');
    expect(ev?.payload?.['host']).toContain('example.com');
    expect(ev?.payload?.['statusCode']).toBe(200);
    expect(typeof ev?.payload?.['duration']).toBe('number');
    expect(typeof ev?.payload?.['durationMs']).toBe('number');
  });

  it('skips localhost:4000 requests (daemon feedback loop)', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);

    http.request('http://localhost:4000/api/sessions');
    expect(emitted.find(e => e.type === HTTP_EVENTS.REQUEST_STARTED)).toBeUndefined();
  });

  it('dispose restores original http.request; no events emitted after', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);
    unpatch();
    unpatch = undefined;

    http.request('http://example.com/');
    expect(emitted.filter(e => e.type === HTTP_EVENTS.REQUEST_STARTED)).toHaveLength(0);
  });

  it('instrument() is idempotent — double call does not double-patch', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;

    const plugin = new HttpPlugin(sdk);
    plugin.instrument();
    const patchedOnce = http.request;
    plugin.instrument(); // second call — should not re-patch
    expect(http.request).toBe(patchedOnce);
    plugin.dispose();
  });

  it('correlationId from getCorrelationId option flows to events', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk, { getCorrelationId: () => 'trace-abc' });

    http.request('http://example.com/');
    expect(emitted.find(e => e.type === HTTP_EVENTS.REQUEST_STARTED)?.correlationId).toBe('trace-abc');
  });

  it('handles URL object (not just string)', () => {
    const req = makeReq();
    const origRequest = vi.fn().mockReturnValue(req);
    (http as unknown as Record<string, unknown>)['request'] = origRequest;
    unpatch = patchHttp(sdk);

    http.request(new URL('http://example.com/api'));
    expect(emitted.find(e => e.type === HTTP_EVENTS.REQUEST_STARTED)).toBeDefined();
  });
});
