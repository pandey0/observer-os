import { asDomainId } from '@observer-os/core';

export const POSTGRES_NODE_TYPES = {
  Connection:  { type: 'observer.postgres/Connection',   domain: asDomainId('postgres') },
  Query:       { type: 'observer.postgres/Query',        domain: asDomainId('postgres') },
  Transaction: { type: 'observer.postgres/Transaction',  domain: asDomainId('postgres') },
} as const;

export const POSTGRES_EVENTS = {
  // Connection lifecycle
  CONNECTION_ACQUIRED: 'observer.postgres/connection.acquired',
  CONNECTION_RELEASED: 'observer.postgres/connection.released',
  CONNECTION_ERROR:    'observer.postgres/connection.error',

  // Query lifecycle
  QUERY_STARTED:   'observer.postgres/query.started',
  QUERY_COMPLETED: 'observer.postgres/query.completed',
  QUERY_FAILED:    'observer.postgres/query.failed',

  // Transaction lifecycle
  TX_STARTED:     'observer.postgres/transaction.started',
  TX_COMMITTED:   'observer.postgres/transaction.committed',
  TX_ROLLED_BACK: 'observer.postgres/transaction.rolled-back',
} as const;
