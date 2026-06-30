import type { RuntimeType } from './plugin.js';

/**
 * observer.plugin.json — plugin package manifest.
 * Lives at the root of a plugin package alongside package.json.
 */
export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly sdkVersion: string;
  readonly runtimeType: RuntimeType;
  readonly description: string;
  readonly author?: string;
  readonly homepage?: string;
  readonly repository?: string;
  readonly entrypoint: string;          // relative path to plugin class file
  readonly config?: ManifestConfigSchema;
  readonly keywords?: readonly string[];
}

export interface ManifestConfigSchema {
  readonly properties: Readonly<Record<string, ManifestConfigProperty>>;
  readonly required?: readonly string[];
}

export interface ManifestConfigProperty {
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  readonly description: string;
  readonly default?: unknown;
  readonly enum?: readonly unknown[];
}

export function validateManifest(raw: unknown): PluginManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Plugin manifest must be a JSON object');
  }
  const m = raw as Record<string, unknown>;
  const required = ['id', 'name', 'version', 'sdkVersion', 'runtimeType', 'description', 'entrypoint'];
  for (const key of required) {
    if (typeof m[key] !== 'string') {
      throw new Error(`Plugin manifest missing required string field: ${key}`);
    }
  }
  return m as unknown as PluginManifest;
}
