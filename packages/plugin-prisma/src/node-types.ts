export const PRISMA_EVENTS = {
  QUERY_STARTED:    'observer.prisma/query.started',
  QUERY_COMPLETED:  'observer.prisma/query.completed',
  QUERY_FAILED:     'observer.prisma/query.failed',
  TX_STARTED:       'observer.prisma/transaction.started',
  TX_COMMITTED:     'observer.prisma/transaction.committed',
  TX_ROLLED_BACK:   'observer.prisma/transaction.rolled-back',
} as const;
