import { emit } from './emitter.js';
import { generateNodeId } from './correlation.js';
import { BROWSER_EVENTS } from './event-types.js';

const EXCEPTION_NODE_ID = generateNodeId('browser', 'exception:global');
const REJECTION_NODE_ID = generateNodeId('browser', 'rejection:global');

export function patchExceptions(): void {
  if (typeof window === 'undefined') return;

  // Uncaught errors
  window.addEventListener('error', (event: ErrorEvent) => {
    emit({
      type: BROWSER_EVENTS.EXCEPTION,
      sourceNodeId: EXCEPTION_NODE_ID,
      occurredAt: Date.now(),
      severity: 'ERROR',
      payload: {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack ?? null,
        name: event.error?.name ?? 'Error',
      },
    });
  }, { capture: true, passive: true });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const isError = reason instanceof Error;
    emit({
      type: BROWSER_EVENTS.UNHANDLED_REJECTION,
      sourceNodeId: REJECTION_NODE_ID,
      occurredAt: Date.now(),
      severity: 'ERROR',
      payload: {
        message: isError ? reason.message : String(reason),
        stack: isError ? (reason.stack ?? null) : null,
        name: isError ? reason.name : 'UnhandledRejection',
      },
    });
  }, { capture: true, passive: true });
}
