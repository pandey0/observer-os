import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ObserverSDK } from '@observer-os/sdk';
import { ReactPlugin } from '../ReactPlugin.js';
import { REACT_EVENTS } from '../node-types.js';

function makeSdk() {
  const emitted: Parameters<ObserverSDK['emit']>[0][] = [];
  return {
    sdk: {
      emit: vi.fn((e) => { emitted.push(e); }),
      isConnected: vi.fn(() => true),
      generateNodeId: vi.fn((k) => `node:${k}`),
    } as unknown as ObserverSDK,
    emitted,
  };
}

// Minimal fake global object for hook installation
function fakeGlobal() {
  return {} as Window & typeof globalThis & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown };
}

describe('ReactPlugin', () => {
  it('installs hook on globalObj', () => {
    const { sdk } = makeSdk();
    const g = fakeGlobal();
    const plugin = new ReactPlugin(sdk);
    plugin.instrument({ globalObj: g });
    expect(g.__REACT_DEVTOOLS_GLOBAL_HOOK__).toBeDefined();
    plugin.dispose();
  });

  it('dispose removes hook', () => {
    const { sdk } = makeSdk();
    const g = fakeGlobal();
    const plugin = new ReactPlugin(sdk);
    plugin.instrument({ globalObj: g });
    plugin.dispose();
    expect(g.__REACT_DEVTOOLS_GLOBAL_HOOK__).toBeUndefined();
  });

  it('emits COMPONENT_MOUNTED on commit of new fiber', () => {
    const { sdk, emitted } = makeSdk();
    const g = fakeGlobal();
    const plugin = new ReactPlugin(sdk);
    plugin.instrument({ globalObj: g });

    const hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__ as {
      onCommitFiberRoot?: (id: number, root: unknown) => void;
    };

    // Simulate a FunctionComponent fiber being committed for the first time
    const fiber = {
      tag: 0, // FunctionComponent
      flags: 0x2, // Placement
      type: { name: 'MyButton', displayName: undefined },
      memoizedProps: { disabled: false },
      memoizedState: null,
      alternate: null,
      child: null,
      sibling: null,
      return: null,
    };

    hook.onCommitFiberRoot?.(1, { current: fiber });

    const mountEvent = emitted.find((e) => e.type === REACT_EVENTS.COMPONENT_MOUNTED);
    expect(mountEvent).toBeDefined();
    expect((mountEvent?.payload as { name: string }).name).toBe('MyButton');

    plugin.dispose();
  });

  it('emits COMPONENT_UPDATED on commit of existing fiber', () => {
    const { sdk, emitted } = makeSdk();
    const g = fakeGlobal();
    const plugin = new ReactPlugin(sdk);
    plugin.instrument({ globalObj: g });

    const hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__ as {
      onCommitFiberRoot?: (id: number, root: unknown) => void;
    };

    const alt = {
      tag: 0,
      flags: 0,
      type: { name: 'Counter' },
      memoizedProps: { count: 0 },
      memoizedState: null,
      alternate: null,
      child: null,
      sibling: null,
      return: null,
    };
    const fiber = {
      tag: 0,
      flags: 0x4, // Update
      type: { name: 'Counter' },
      memoizedProps: { count: 1 },
      memoizedState: null,
      alternate: alt,
      child: null,
      sibling: null,
      return: null,
    };

    hook.onCommitFiberRoot?.(1, { current: fiber });

    const updateEvent = emitted.find((e) => e.type === REACT_EVENTS.COMPONENT_UPDATED);
    expect(updateEvent).toBeDefined();
    expect((updateEvent?.payload as { changedProps?: { count: number } }).changedProps).toEqual({ count: 1 });

    plugin.dispose();
  });

  it('emits COMPONENT_UNMOUNTED via onCommitFiberUnmount', () => {
    const { sdk, emitted } = makeSdk();
    const g = fakeGlobal();
    const plugin = new ReactPlugin(sdk);
    plugin.instrument({ globalObj: g });

    const hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__ as {
      onCommitFiberUnmount?: (id: number, fiber: unknown) => void;
    };

    const fiber = {
      tag: 0, // FunctionComponent
      flags: 0,
      type: { name: 'Modal' },
      memoizedProps: {},
      memoizedState: null,
      alternate: null,
      child: null,
      sibling: null,
      return: null,
    };

    hook.onCommitFiberUnmount?.(1, fiber);

    const unmountEvent = emitted.find((e) => e.type === REACT_EVENTS.COMPONENT_UNMOUNTED);
    expect(unmountEvent).toBeDefined();
    expect((unmountEvent?.payload as { name: string }).name).toBe('Modal');

    plugin.dispose();
  });

  it('skips emission when sdk not connected', () => {
    const { sdk, emitted } = makeSdk();
    (sdk.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const g = fakeGlobal();
    const plugin = new ReactPlugin(sdk);
    plugin.instrument({ globalObj: g });

    const hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__ as {
      onCommitFiberRoot?: (id: number, root: unknown) => void;
    };
    const fiber = {
      tag: 0, flags: 0x2, type: { name: 'Btn' }, memoizedProps: {}, memoizedState: null,
      alternate: null, child: null, sibling: null, return: null,
    };
    hook.onCommitFiberRoot?.(1, { current: fiber });

    expect(emitted.length).toBe(0);
    plugin.dispose();
  });

  it('does not reinstall when instrument called twice', () => {
    const { sdk } = makeSdk();
    const g = fakeGlobal();
    const plugin = new ReactPlugin(sdk);
    plugin.instrument({ globalObj: g });
    const first = g.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    plugin.instrument({ globalObj: g });
    expect(g.__REACT_DEVTOOLS_GLOBAL_HOOK__).toBe(first);
    plugin.dispose();
  });
});
