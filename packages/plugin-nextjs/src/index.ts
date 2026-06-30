// ─── Main plugin class ────────────────────────────────────────────────────────
export { NextjsPlugin } from './NextjsPlugin.js';

// ─── Event constants ──────────────────────────────────────────────────────────
export { NEXTJS_EVENTS } from './node-types.js';
export type { NextjsEventType } from './node-types.js';

// ─── Instrumentation helpers ──────────────────────────────────────────────────
export { patchFetch } from './instrumentation/fetchWrapper.js';
export { runWithNextCorrelation, getNextCorrelationId } from './instrumentation/alsContext.js';
export { registerObserver } from './instrumentation/register.js';

// ─── Router wrappers ──────────────────────────────────────────────────────────
export { withObserver } from './routers/pagesRouter.js';
export { withObserverMiddleware } from './routers/edgeMiddleware.js';
export { withAppRouterObserver } from './routers/appRouter.js';
