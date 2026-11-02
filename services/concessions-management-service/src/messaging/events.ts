import { randomUUID } from 'node:crypto';
import { config } from '../config';

export interface EventEnvelope {
  id: string;
  eventType: string;
  eventVersion: number;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  concessionId: string;
  assemblyId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  payload: unknown;
}

export interface BuildEnvelopeInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  concessionId: string;
  assemblyId: string;
  correlationId?: string;
  causationId?: string;
  payload: unknown;
}

export function buildEnvelope(input: BuildEnvelopeInput): EventEnvelope {
  return {
    id: randomUUID(),
    eventType: input.eventType,
    eventVersion: 1,
    producer: config.serviceName,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion,
    concessionId: input.concessionId,
    assemblyId: input.assemblyId,
    correlationId: input.correlationId ?? randomUUID(),
    causationId: input.causationId,
    occurredAt: new Date().toISOString(),
    payload: input.payload,
  };
}
