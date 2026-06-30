import { emit } from './emitter.js';
import { generateNodeId } from './correlation.js';
import { BROWSER_EVENTS } from './event-types.js';

const NAV_NODE_ID = generateNodeId('browser', 'navigation:global');

export function patchNavigation(): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;

  // Emit initial page load
  emit({
    type: BROWSER_EVENTS.NAVIGATION_LOAD,
    sourceNodeId: NAV_NODE_ID,
    occurredAt: Date.now(),
    payload: {
      url: window.location.href,
      referrer: document.referrer || null,
      title: document.title,
    },
  });

  // Patch history.pushState
  const originalPush = history.pushState.bind(history);
  history.pushState = function observerPushState(
    state: unknown, unused: string, url?: string | URL | null
  ): void {
    originalPush(state, unused, url);
    emit({
      type: BROWSER_EVENTS.NAVIGATION_PUSH,
      sourceNodeId: NAV_NODE_ID,
      occurredAt: Date.now(),
      payload: {
        url: window.location.href,
        title: document.title,
      },
    });
  };

  // Patch history.replaceState
  const originalReplace = history.replaceState.bind(history);
  history.replaceState = function observerReplaceState(
    state: unknown, unused: string, url?: string | URL | null
  ): void {
    originalReplace(state, unused, url);
    emit({
      type: BROWSER_EVENTS.NAVIGATION_REPLACE,
      sourceNodeId: NAV_NODE_ID,
      occurredAt: Date.now(),
      payload: {
        url: window.location.href,
        title: document.title,
      },
    });
  };

  // Back/forward navigation
  window.addEventListener('popstate', () => {
    emit({
      type: BROWSER_EVENTS.NAVIGATION_POP,
      sourceNodeId: NAV_NODE_ID,
      occurredAt: Date.now(),
      payload: {
        url: window.location.href,
        title: document.title,
      },
    });
  });

  // Hash changes
  window.addEventListener('hashchange', () => {
    emit({
      type: BROWSER_EVENTS.NAVIGATION_HASH,
      sourceNodeId: NAV_NODE_ID,
      occurredAt: Date.now(),
      payload: {
        url: window.location.href,
        hash: window.location.hash,
      },
    });
  });
}
