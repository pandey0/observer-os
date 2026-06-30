import type { NodeTypeRegistration } from '@observer-os/core';
import { asDomainId } from '@observer-os/core';

const DOMAIN = asDomainId('browser');

export const BROWSER_NODE_TYPES: NodeTypeRegistration[] = [
  {
    type: 'observer.browser/HttpRequest',
    displayName: 'HTTP Request',
    description: 'A fetch() or XHR network request',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE', 'INSPECT'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.browser/WebSocketConnection',
    displayName: 'WebSocket Connection',
    description: 'A WebSocket connection from the browser',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE', 'INSPECT'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.browser/ConsoleMessage',
    displayName: 'Console Message',
    description: 'A console.log/warn/error/info/debug call',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.browser/Exception',
    displayName: 'Exception',
    description: 'An uncaught error or unhandled promise rejection',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE', 'INSPECT'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.browser/Navigation',
    displayName: 'Navigation',
    description: 'A page navigation or SPA route change',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.browser/DomInteraction',
    displayName: 'DOM Interaction',
    description: 'A user click, input, or form submission',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.browser/PerformanceMark',
    displayName: 'Performance Mark',
    description: 'A performance.mark() or PerformanceObserver entry',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE'],
    domainId: DOMAIN,
  },
];

// ─── Event type constants ─────────────────────────────────────────────────────

export const BROWSER_EVENTS = {
  // Network
  FETCH_STARTED:        'observer.browser/network.request.started',
  FETCH_COMPLETED:      'observer.browser/network.request.completed',
  FETCH_FAILED:         'observer.browser/network.request.failed',
  XHR_STARTED:          'observer.browser/network.xhr.started',
  XHR_COMPLETED:        'observer.browser/network.xhr.completed',
  XHR_FAILED:           'observer.browser/network.xhr.failed',
  WS_OPENED:            'observer.browser/network.ws.opened',
  WS_CLOSED:            'observer.browser/network.ws.closed',
  WS_MESSAGE_SENT:      'observer.browser/network.ws.message.sent',
  WS_MESSAGE_RECEIVED:  'observer.browser/network.ws.message.received',

  // Console
  CONSOLE_LOG:    'observer.browser/console.log',
  CONSOLE_WARN:   'observer.browser/console.warn',
  CONSOLE_ERROR:  'observer.browser/console.error',
  CONSOLE_INFO:   'observer.browser/console.info',
  CONSOLE_DEBUG:  'observer.browser/console.debug',
  CONSOLE_GROUP:  'observer.browser/console.group',

  // Exceptions
  EXCEPTION:           'observer.browser/exception.uncaught',
  UNHANDLED_REJECTION: 'observer.browser/exception.unhandled_rejection',

  // Navigation
  NAVIGATION_PUSH:    'observer.browser/navigation.push',
  NAVIGATION_POP:     'observer.browser/navigation.pop',
  NAVIGATION_REPLACE: 'observer.browser/navigation.replace',
  NAVIGATION_LOAD:    'observer.browser/navigation.load',
  NAVIGATION_HASH:    'observer.browser/navigation.hash',

  // DOM
  DOM_CLICK:        'observer.browser/dom.click',
  DOM_INPUT:        'observer.browser/dom.input',
  DOM_SUBMIT:       'observer.browser/dom.submit',

  // Performance
  PERFORMANCE_MARK:    'observer.browser/performance.mark',
  PERFORMANCE_MEASURE: 'observer.browser/performance.measure',
  LONG_TASK:           'observer.browser/performance.long_task',
} as const;

export type BrowserEventType = typeof BROWSER_EVENTS[keyof typeof BROWSER_EVENTS];
