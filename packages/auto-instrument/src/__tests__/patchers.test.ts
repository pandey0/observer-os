import { describe, it, expect, vi } from 'vitest';

// Make http/https into mutable plain objects so patchHttpServer/patchHttpClient
// can redefine their properties (vitest's ESM loader makes built-in exports
// non-configurable otherwise).
vi.mock('http', async () => {
  const actual = await vi.importActual<typeof import('http')>('http');
  return { ...actual };
});
vi.mock('https', async () => {
  const actual = await vi.importActual<typeof import('https')>('https');
  return { ...actual };
});

import * as http from 'http';
import { patchHttpServer } from '../patchers/httpServer';
import { patchHttpClient } from '../patchers/httpClient';
import { EventQueue } from '../queue';
import { tryRequire, isAvailable } from '../detect';

describe('patchHttpServer', () => {
  it('patches http.Server.prototype.emit with a wrapper', () => {
    const queue = new EventQueue();
    const origEmit = http.Server.prototype.emit;

    patchHttpServer(queue);

    expect(http.Server.prototype.emit).not.toBe(origEmit);
    expect(typeof http.Server.prototype.emit).toBe('function');

    // Restore for subsequent tests
    http.Server.prototype.emit = origEmit;
  });
});

describe('patchHttpClient', () => {
  it('patches http.request', () => {
    const queue = new EventQueue();
    const origRequest = http.request;

    patchHttpClient(queue);

    expect(http.request).not.toBe(origRequest);
    expect(typeof http.request).toBe('function');

    // Restore
    Object.defineProperty(http, 'request', { value: origRequest, writable: true, configurable: true });
  });
});

describe('EventQueue + client integration', () => {
  it('queues events when not connected, flushes when handler set', () => {
    const q = new EventQueue();
    const flushed: unknown[] = [];

    q.push({ type: 'observer.http-server/request.started', sourceNodeId: 'n1', occurredAt: Date.now() });
    q.push({ type: 'observer.http-server/request.completed', sourceNodeId: 'n1', occurredAt: Date.now() });

    q.setFlushHandler(e => flushed.push(e));

    return new Promise<void>(resolve => setImmediate(() => {
      expect(flushed.length).toBe(2);
      resolve();
    }));
  });
});

describe('detect', () => {
  it('tryRequire returns module if available', () => {
    expect(tryRequire('node:path')).not.toBeNull();
  });

  it('tryRequire returns null if not available', () => {
    expect(tryRequire('does-not-exist-xyz-12345')).toBeNull();
  });

  it('isAvailable returns true for node builtins', () => {
    expect(isAvailable('node:path')).toBe(true);
  });

  it('isAvailable returns false for unknown packages', () => {
    expect(isAvailable('does-not-exist-xyz-12345')).toBe(false);
  });
});
