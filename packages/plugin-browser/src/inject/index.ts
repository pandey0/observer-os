/**
 * Observer OS Browser Injection Script
 *
 * Include in your page AFTER setting window.__OBSERVER_CONFIG__:
 *
 *   <script>
 *     window.__OBSERVER_CONFIG__ = {
 *       sessionId: 'ses_...',
 *       bridgeUrl: 'http://localhost:7891',
 *     };
 *   </script>
 *   <script src="http://localhost:7891/observer-inject.js"></script>
 *
 * OR let the BrowserObserverPlugin serve the config automatically.
 */

import { initEmitter, flushSync } from './emitter.js';
import { patchFetch } from './fetch.js';
import { patchXhr } from './xhr.js';
import { patchConsole } from './console.js';
import { patchExceptions } from './exception.js';
import { patchNavigation } from './navigation.js';
import type { ObserverConfig } from './types.js';

declare global {
  interface Window {
    __OBSERVER_CONFIG__?: ObserverConfig;
    __OBSERVER_LOADED__?: boolean;
  }
}

function init(): void {
  if (window.__OBSERVER_LOADED__) return; // idempotent
  window.__OBSERVER_LOADED__ = true;

  const config = window.__OBSERVER_CONFIG__;
  if (!config?.sessionId || !config?.bridgeUrl) {
    console.warn('[Observer] Missing __OBSERVER_CONFIG__ — instrumentation disabled');
    return;
  }

  initEmitter(config);

  // Order matters: patch low-level APIs before higher-level ones
  patchExceptions();   // first — catch errors from instrumentation setup too
  patchFetch();        // before XHR (fetch uses original XHR internally in some browsers)
  patchXhr();
  patchConsole();
  patchNavigation();   // last — emits the initial navigation.load event

  // Flush remaining events before page unloads
  window.addEventListener('pagehide', flushSync);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSync();
  });
}

// Auto-init: run when DOM is ready or immediately if already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
