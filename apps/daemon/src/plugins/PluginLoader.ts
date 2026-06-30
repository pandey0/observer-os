import type { ObserverPlugin } from '@observer-os/sdk';
import type { PluginRegistry } from '@observer-os/sdk';
import type { PluginConfig } from '@observer-os/sdk';

export interface PluginRegistration {
  readonly plugin: ObserverPlugin;
  readonly config?: PluginConfig;
}

/**
 * PluginLoader manages static plugin registration for Phase 1.
 * Phase 2 adds filesystem discovery from ~/.observer/plugins/.
 */
export class PluginLoader {
  private readonly registrations: PluginRegistration[] = [];

  add(plugin: ObserverPlugin, config?: PluginConfig): this {
    this.registrations.push({ plugin, config });
    return this;
  }

  addMany(plugins: PluginRegistration[]): this {
    this.registrations.push(...plugins);
    return this;
  }

  load(registry: PluginRegistry): void {
    for (const { plugin, config } of this.registrations) {
      registry.register(plugin, config ?? {});
    }
  }

  get count(): number {
    return this.registrations.length;
  }
}
