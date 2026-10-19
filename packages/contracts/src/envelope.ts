import { z } from 'zod';

/**
 * Shared event envelope carried over RabbitMQ. Producers write the envelope
 * metadata plus a business payload; consumers validate and apply it.
 */
export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  eventVersion: z.number().int().positive(),
  producer: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string().uuid(),
  aggregateVersion: z.number().int().nonnegative(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  correlationId: z.string(),
  causationId: z.string().uuid().optional(),
  occurredAt: z.string().datetime(),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
