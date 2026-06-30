import { z } from 'zod';

export const CreateSessionSchema = z.object({
  name: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const EmitEventSchema = z.object({
  type: z.string().min(1).max(200),
  sourceNodeId: z.string().min(1),
  occurredAt: z.number().optional(),
  payload: z.record(z.unknown()).optional().default({}),
  correlationId: z.string().optional(),
  severity: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional(),
  affectedNodeIds: z.array(z.string()).optional(),
  causedByEventId: z.string().optional(),
  schemaVersion: z.string().optional(),
});

export const CreateAnnotationSchema = z.object({
  nodeId: z.string().optional(),
  eventId: z.string().optional(),
  text: z.string().min(1).max(1000),
  author: z.string().max(100).optional(),
});
