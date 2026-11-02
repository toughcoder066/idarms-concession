import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';
import { appendOutboxEvent } from '../messaging/outbox';

/**
 * Downstream relay: a CROIP event for this concession is recorded in the
 * SyncRecord ledger and re-published onto the local idarms.events exchange
 * with its local routing key (croip.* prefix stripped).
 */
export async function recordDownstreamSync(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const entityType = event.aggregateType;
  const entityId = event.aggregateId;
  const now = new Date();

  await tx.syncRecord.upsert({
    where: { entityType_entityId_direction: { entityType, entityId, direction: 'DOWNSTREAM' } },
    create: {
      entityType,
      entityId,
      direction: 'DOWNSTREAM',
      status: 'SYNCED',
      croipReference: event.id,
      lastSyncedAt: now,
    },
    update: { status: 'SYNCED', croipReference: event.id, lastSyncedAt: now },
  });

  const localKey = event.eventType.startsWith('croip.')
    ? event.eventType.slice('croip.'.length)
    : event.eventType;

  await appendOutboxEvent(tx, { ...event, eventType: localKey, causationId: event.id }, localKey);
}

/**
 * Upstream relay: record the event as pending and enqueue it for delivery
 * through CROIP's Reporting Gateway.
 */
export async function recordUpstreamSync(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const entityType = event.aggregateType;
  const entityId = event.aggregateId;
  const now = new Date();

  await tx.syncRecord.upsert({
    where: { entityType_entityId_direction: { entityType, entityId, direction: 'UPSTREAM' } },
    create: {
      entityType,
      entityId,
      direction: 'UPSTREAM',
      status: 'PENDING',
      croipReference: null,
      lastSyncedAt: now,
    },
    update: { status: 'PENDING', croipReference: null, lastSyncedAt: now },
  });

  const croipKey = `croip.${event.eventType}`;

  await appendOutboxEvent(tx, { ...event, eventType: croipKey, causationId: event.id }, croipKey);
}
