import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';
import { upsertRatepayer } from './ratepayer.handler';

export type EventHandler = (tx: Prisma.TransactionClient, event: EventEnvelope) => Promise<unknown>;

/**
 * Maps consumed event types (which equal their RabbitMQ routing keys) to the
 * business handler that applies the effect inside the inbox transaction.
 */
export function registerEventHandlers(): Map<string, EventHandler> {
  return new Map<string, EventHandler>([
    ['ratepayer.registered.v1', upsertRatepayer],
  ]);
}
