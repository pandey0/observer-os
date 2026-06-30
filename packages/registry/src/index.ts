import { createRequire } from 'node:module';
import type { PluginEntry, Registry, SearchOptions } from './types.js';

export type { PluginEntry, Registry, SearchOptions };

const require = createRequire(import.meta.url);
const registry = require('./registry.json') as Registry;

export function getAllPlugins(): PluginEntry[] {
  return registry.plugins;
}

export function getPlugin(id: string): PluginEntry | undefined {
  return registry.plugins.find(p => p.id === id);
}

export function searchPlugins(options: SearchOptions = {}): PluginEntry[] {
  let results = [...registry.plugins];

  if (options.category) {
    results = results.filter(p => p.category === options.category);
  }

  if (options.runtime) {
    results = results.filter(p => p.runtimes.includes(options.runtime!));
  }

  if (options.firstParty !== undefined) {
    results = results.filter(p => p.firstParty === options.firstParty);
  }

  if (options.verified !== undefined) {
    results = results.filter(p => p.verified === options.verified);
  }

  if (options.query) {
    const q = options.query.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.displayName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      p.nodeTypes.some(nt => nt.toLowerCase().includes(q)),
    );
  }

  return results;
}

export function getRegistryMeta(): { schemaVersion: string; updatedAt: string; total: number } {
  return {
    schemaVersion: registry.schemaVersion,
    updatedAt: registry.updatedAt,
    total: registry.plugins.length,
  };
}
