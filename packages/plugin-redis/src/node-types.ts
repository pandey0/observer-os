export const REDIS_EVENTS = {
  COMMAND_STARTED:    'observer.redis/command.started',
  COMMAND_COMPLETED:  'observer.redis/command.completed',
  COMMAND_FAILED:     'observer.redis/command.failed',
  PIPELINE_STARTED:   'observer.redis/pipeline.started',
  PIPELINE_COMPLETED: 'observer.redis/pipeline.completed',
  PIPELINE_FAILED:    'observer.redis/pipeline.failed',
  CONNECT:            'observer.redis/connect',
  DISCONNECT:         'observer.redis/disconnect',
  ERROR:              'observer.redis/error',
} as const;
