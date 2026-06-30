import type { RuntimeEvent } from '@observer-os/core';

export type UpcasterFn = (payload: Record<string, unknown>) => Record<string, unknown>;

interface UpcasterEntry {
  readonly eventType: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly fn: UpcasterFn;
}

/**
 * Registry of event schema upcasters.
 *
 * When a plugin evolves its event schema, it registers an upcaster here.
 * Old events in the Event Log are NEVER modified — they're transformed
 * at projection time by chaining upcasters from old version to current.
 *
 * Example chain: 1.0.0 → 2.0.0 → 3.0.0
 * Registering 1→2 and 2→3 lets an old 1.0.0 event reach 3.0.0 automatically.
 */
export class UpcasterRegistry {
  // eventType → version-ordered chain
  private readonly chains = new Map<string, UpcasterEntry[]>();

  register(
    eventType: string,
    fromVersion: string,
    toVersion: string,
    fn: UpcasterFn,
  ): void {
    if (!this.chains.has(eventType)) {
      this.chains.set(eventType, []);
    }
    const chain = this.chains.get(eventType)!;

    // Prevent duplicate registration
    const exists = chain.some(
      e => e.fromVersion === fromVersion && e.toVersion === toVersion
    );
    if (exists) return;

    chain.push({ eventType, fromVersion, toVersion, fn });
  }

  /**
   * Upcast an event to the latest known schema version.
   * Returns the original event unchanged if no upcasters apply.
   */
  upcast(event: RuntimeEvent): RuntimeEvent {
    const chain = this.chains.get(event.type);
    if (!chain || chain.length === 0) return event;

    let version = event.schemaVersion;
    let payload = { ...(event.payload as Record<string, unknown>) };
    let upcasted = false;

    // Walk the chain until no more upcasters apply
    let progress = true;
    while (progress) {
      progress = false;
      for (const entry of chain) {
        if (entry.fromVersion === version) {
          payload = entry.fn(payload);
          version = entry.toVersion;
          upcasted = true;
          progress = true;
          break;
        }
      }
    }

    if (!upcasted) return event;

    // Return a new event object with updated payload and schema version
    return Object.freeze({
      ...event,
      payload: Object.freeze(payload),
      schemaVersion: version,
    }) as RuntimeEvent;
  }

  /** How many upcaster steps are registered for an event type. */
  depth(eventType: string): number {
    return this.chains.get(eventType)?.length ?? 0;
  }

  hasUpcasters(eventType: string): boolean {
    return (this.chains.get(eventType)?.length ?? 0) > 0;
  }
}
