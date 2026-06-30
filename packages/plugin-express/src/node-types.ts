import type { NodeTypeRegistration } from '@observer-os/core';
import { asDomainId } from '@observer-os/core';

const DOMAIN = asDomainId('express');

export const EXPRESS_NODE_TYPES: NodeTypeRegistration[] = [
  {
    type: 'observer.express/HttpServer',
    displayName: 'Express HTTP Server',
    description: 'An Express.js server instance listening on a port',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'SNAPSHOT', 'INSPECT'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.express/Request',
    displayName: 'HTTP Request',
    description: 'A single inbound HTTP request handled by Express',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE', 'INSPECT'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.express/Route',
    displayName: 'Route Handler',
    description: 'An Express route (method + path pattern)',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE', 'INSPECT', 'REPLAY'],
    domainId: DOMAIN,
  },
  {
    type: 'observer.express/ErrorHandler',
    displayName: 'Error Handler',
    description: 'An Express error-handling middleware',
    schemaVersion: '1.0.0',
    capabilities: ['WATCH', 'TIMELINE'],
    domainId: DOMAIN,
  },
];

export const EXPRESS_EVENTS = {
  SERVER_STARTED:         'observer.express/server.started',
  SERVER_STOPPED:         'observer.express/server.stopped',
  REQUEST_STARTED:        'observer.express/request.started',
  REQUEST_COMPLETED:      'observer.express/request.completed',
  REQUEST_FAILED:         'observer.express/request.failed',
  ROUTE_MATCHED:          'observer.express/route.matched',
  MIDDLEWARE_STARTED:     'observer.express/middleware.started',
  MIDDLEWARE_COMPLETED:   'observer.express/middleware.completed',
  ERROR_CAUGHT:           'observer.express/error.caught',
} as const;

export type ExpressEventType = typeof EXPRESS_EVENTS[keyof typeof EXPRESS_EVENTS];
