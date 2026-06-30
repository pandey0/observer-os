import { describe, it, expect } from 'vitest';
import { getAllPlugins, getPlugin, searchPlugins, getRegistryMeta } from '../index.js';

describe('getAllPlugins', () => {
  it('returns all 9 plugins', () => {
    expect(getAllPlugins().length).toBe(9);
  });

  it('all plugins have required fields', () => {
    for (const p of getAllPlugins()) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.version).toBeTruthy();
      expect(Array.isArray(p.tags)).toBe(true);
      expect(Array.isArray(p.nodeTypes)).toBe(true);
      expect(Array.isArray(p.runtimes)).toBe(true);
    }
  });

  it('all first-party plugins are verified', () => {
    for (const p of getAllPlugins().filter(p => p.firstParty)) {
      expect(p.verified).toBe(true);
    }
  });
});

describe('getPlugin', () => {
  it('returns plugin by id', () => {
    const p = getPlugin('plugin-express');
    expect(p?.name).toBe('@observer-os/plugin-express');
  });

  it('returns undefined for unknown id', () => {
    expect(getPlugin('does-not-exist')).toBeUndefined();
  });
});

describe('searchPlugins', () => {
  it('empty options returns all plugins', () => {
    expect(searchPlugins().length).toBe(9);
  });

  it('filters by category', () => {
    const db = searchPlugins({ category: 'database' });
    expect(db.length).toBeGreaterThan(0);
    expect(db.every(p => p.category === 'database')).toBe(true);
  });

  it('filters by runtime', () => {
    const browserOnly = searchPlugins({ runtime: 'browser' });
    expect(browserOnly.length).toBeGreaterThan(0);
    expect(browserOnly.every(p => p.runtimes.includes('browser'))).toBe(true);
  });

  it('filters by firstParty', () => {
    const firstParty = searchPlugins({ firstParty: true });
    expect(firstParty.every(p => p.firstParty)).toBe(true);
  });

  it('filters by query matching name', () => {
    const results = searchPlugins({ query: 'redis' });
    expect(results.some(p => p.id === 'plugin-redis')).toBe(true);
  });

  it('filters by query matching tag', () => {
    const results = searchPlugins({ query: 'prisma' });
    expect(results.some(p => p.id === 'plugin-prisma')).toBe(true);
  });

  it('filters by query matching description', () => {
    const results = searchPlugins({ query: 'PII-safe' });
    expect(results.some(p => p.id === 'plugin-prisma')).toBe(true);
  });

  it('query matching node type', () => {
    const results = searchPlugins({ query: 'observer.graphql' });
    expect(results.some(p => p.id === 'plugin-graphql')).toBe(true);
  });

  it('combines category + runtime filters', () => {
    const results = searchPlugins({ category: 'database', runtime: 'node' });
    expect(results.every(p => p.category === 'database' && p.runtimes.includes('node'))).toBe(true);
  });

  it('returns empty for impossible filter combo', () => {
    expect(searchPlugins({ category: 'database', runtime: 'browser' }).length).toBe(0);
  });

  it('query is case-insensitive', () => {
    expect(searchPlugins({ query: 'REDIS' }).length).toBe(searchPlugins({ query: 'redis' }).length);
  });
});

describe('getRegistryMeta', () => {
  it('returns total plugin count', () => {
    const meta = getRegistryMeta();
    expect(meta.total).toBe(9);
    expect(meta.schemaVersion).toBe('1.0');
    expect(meta.updatedAt).toBeTruthy();
  });
});
