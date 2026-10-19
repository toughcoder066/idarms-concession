import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

export type EventHandler = (tx: Prisma.TransactionClient, event: EventEnvelope) => Promise<unknown>;

/**
 * Register consumed event types to business handlers.
 *
 * Phase 2+ work: map every routing key declared in config.consumedRoutingKeys
 * to a handler that applies the business effect inside the inbox transaction.
 */
export function registerEventHandlers(): Map<string, EventHandler> {
  return new Map<string, EventHandler>([]);
}
