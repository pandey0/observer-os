import type { ObserverSDK } from '@observer-os/sdk';
import { stableNodeId } from '@observer-os/sdk';
import { REACT_EVENTS } from '../node-types.js';

// React DevTools global hook shape (subset we care about)
interface ReactDevToolsHook {
  inject?: (renderer: unknown) => void;
  onCommitFiberRoot?: (rendererId: number, root: FiberRoot, priorityLevel: number) => void;
  onCommitFiberUnmount?: (rendererId: number, fiber: Fiber) => void;
  renderers?: Map<number, unknown>;
  _renderers?: Record<number, unknown>;
  checkDCE?: () => void;
  supportsFiber?: boolean;
}

// Minimal Fiber shape — only properties we read
interface Fiber {
  type: FiberType | null;
  memoizedProps: Record<string, unknown> | null;
  memoizedState: unknown;
  tag: number;
  flags: number;
  alternate: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  return: Fiber | null;
  effectTag?: number;
}

// FiberRoot wraps the root Fiber
interface FiberRoot {
  current: Fiber;
}

type FiberType = string | { name?: string; displayName?: string };

// React fiber tags (subset)
const FunctionComponent = 0;
const ClassComponent = 1;
const SuspenseComponent = 13;

// Fiber flags / effect tags
const Placement = 0x000002;
const Update = 0x000004;
const ChildDeletion = 0x000010;
const DidCapture = 0x000200;

/**
 * Install an observer into the React DevTools global hook.
 * Must be called BEFORE React is loaded (or immediately after if __REACT_DEVTOOLS_GLOBAL_HOOK__
 * already exists from DevTools extension).
 *
 * Returns an uninstall function.
 */
type GlobalWithHook = { __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook };

export function installDevToolsHook(sdk: ObserverSDK, globalObj?: Window & typeof globalThis): () => void {
  const g = (globalObj ?? globalThis) as typeof globalThis & GlobalWithHook;

  const existingHook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__;

  // Props diff helper — returns keys that changed, limit to 10 keys, sanitize values
  function diffProps(prev: Record<string, unknown> | null, next: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!prev || !next) return null;
    const changed: Record<string, unknown> = {};
    for (const key of Object.keys(next)) {
      if (key === 'children') continue;
      if (prev[key] !== next[key]) {
        changed[key] = sanitize(next[key]);
      }
    }
    return Object.keys(changed).length > 0 ? changed : null;
  }

  function sanitize(v: unknown): unknown {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'string') return (v as string).slice(0, 100);
    if (t === 'number' || t === 'boolean') return v;
    if (Array.isArray(v)) return `[Array(${(v as unknown[]).length})]`;
    if (t === 'object') return '[Object]';
    if (t === 'function') return '[Function]';
    return String(v).slice(0, 50);
  }

  function getComponentName(fiber: Fiber): string {
    const { type } = fiber;
    if (!type) return 'Unknown';
    if (typeof type === 'string') return type;
    if (type.displayName) return type.displayName;
    if (type.name) return type.name;
    return 'Anonymous';
  }

  function nodeIdFor(fiber: Fiber): ReturnType<typeof stableNodeId> {
    const name = getComponentName(fiber);
    return stableNodeId('react', name);
  }

  // Walk a fiber subtree, emitting mount/update/unmount events
  function visitFiber(fiber: Fiber | null, isNewTree: boolean): void {
    if (!fiber) return;

    const { tag, flags } = fiber;

    if (tag === FunctionComponent || tag === ClassComponent) {
      const name = getComponentName(fiber);
      const nodeId = nodeIdFor(fiber);
      const isNew = !fiber.alternate || (flags & Placement) !== 0;
      const isUpdated = !isNew && (flags & Update) !== 0;

      if (isNew) {
        sdk.emit({
          type: REACT_EVENTS.COMPONENT_MOUNTED,
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: 'DEBUG',
          payload: { name, propCount: Object.keys(fiber.memoizedProps ?? {}).length },
        });
      } else if (isUpdated) {
        const prevProps = fiber.alternate?.memoizedProps ?? null;
        const changedProps = diffProps(prevProps, fiber.memoizedProps);
        sdk.emit({
          type: REACT_EVENTS.COMPONENT_UPDATED,
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: 'DEBUG',
          payload: { name, changedProps },
        });
      }

      // Error boundary caught an error
      if ((flags & DidCapture) !== 0) {
        sdk.emit({
          type: REACT_EVENTS.COMPONENT_ERRORED,
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: 'ERROR',
          payload: { name, errorBoundary: true },
        });
      }
    }

    if (tag === SuspenseComponent) {
      const nodeId = stableNodeId('react', 'Suspense');
      const isPending = (flags & DidCapture) !== 0;
      sdk.emit({
        type: isPending ? REACT_EVENTS.SUSPENSE_PENDING : REACT_EVENTS.SUSPENSE_RESOLVED,
        sourceNodeId: nodeId,
        occurredAt: Date.now(),
        severity: 'DEBUG',
        payload: {},
      });
    }

    visitFiber(fiber.child, isNewTree);
    visitFiber(fiber.sibling, isNewTree);
  }

  function onCommitFiberRoot(_rendererId: number, root: FiberRoot): void {
    if (!sdk.isConnected()) return;
    try {
      visitFiber(root.current, false);
    } catch {
      // Never let observer errors crash the host app
    }
  }

  function onCommitFiberUnmount(_rendererId: number, fiber: Fiber): void {
    if (!sdk.isConnected()) return;
    const tag = fiber.tag;
    if (tag !== FunctionComponent && tag !== ClassComponent) return;
    try {
      const name = getComponentName(fiber);
      sdk.emit({
        type: REACT_EVENTS.COMPONENT_UNMOUNTED,
        sourceNodeId: nodeIdFor(fiber),
        occurredAt: Date.now(),
        severity: 'DEBUG',
        payload: { name },
      });
    } catch {
      // ignore
    }
  }

  // Patch or create the hook
  if (existingHook) {
    const origCommit = existingHook.onCommitFiberRoot;
    const origUnmount = existingHook.onCommitFiberUnmount;

    existingHook.onCommitFiberRoot = function (id, root, pri) {
      origCommit?.call(this, id, root, pri);
      onCommitFiberRoot(id, root);
    };
    existingHook.onCommitFiberUnmount = function (id, fiber) {
      origUnmount?.call(this, id, fiber);
      onCommitFiberUnmount(id, fiber);
    };

    return () => {
      existingHook.onCommitFiberRoot = origCommit;
      existingHook.onCommitFiberUnmount = origUnmount;
    };
  } else {
    // Install a minimal hook that React will use
    const hook: ReactDevToolsHook = {
      supportsFiber: true,
      onCommitFiberRoot,
      onCommitFiberUnmount,
      inject: () => {},
    };
    g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;

    return () => {
      delete g.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    };
  }
}
