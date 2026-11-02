import type { Prisma, PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { getChannel } from './rabbit';
import type { EventEnvelope } from './events';
import { submitCloudEvent } from './croip-gateway';

type TxClient = Prisma.TransactionClient;

/**
 * Write an outgoing event inside the same transaction as the business change.
 * Never publish directly to RabbitMQ from an API transaction.
 */
export async function appendOutboxEvent(
  tx: TxClient,
  envelope: EventEnvelope,
  routingKey: string,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      id: envelope.id,
      eventType: envelope.eventType,
      eventVersion: envelope.eventVersion,
      aggregateType: envelope.aggregateType,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
      routingKey,
      payload: envelope.payload as Prisma.InputJsonValue,
      headers: {
        producer: envelope.producer,
        correlationId: envelope.correlationId,
        causationId: envelope.causationId ?? null,
        concessionId: envelope.concessionId,
        assemblyId: envelope.assemblyId,
      },
      occurredAt: new Date(envelope.occurredAt),
    },
  });
}

interface OutboxRow {
  id: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  routingKey: string;
  payload: Prisma.JsonValue;
  headers: Record<string, string | null | undefined>;
  occurredAt: Date;
  attempts: number;
}

function nextAttemptAt(attempts: number): Date {
  const seconds = Math.min(300, 2 ** Math.min(attempts, 8));
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Claim committed events, publish local events to RabbitMQ, and submit events
 * for CROIP to its authenticated Reporting Gateway. A row is marked published
 * only after its destination confirms acceptance.
 */
export async function publishDueOutbox(
  prisma: PrismaClient,
  batchSize = 100,
): Promise<number> {
  const rows = await prisma.$transaction(async (tx) => {
    const claimed = await tx.$queryRaw<OutboxRow[]>`
      SELECT "id", "eventType", "eventVersion", "aggregateType", "aggregateId",
             "aggregateVersion", "routingKey", "payload", "headers", "occurredAt", "attempts"
      FROM outbox_events
      WHERE "publishedAt" IS NULL
        AND "nextAttemptAt" <= now()
        AND ("lockedAt" IS NULL OR "lockedAt" < now() - INTERVAL '5 minutes')
      ORDER BY "occurredAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;
    for (const row of claimed) {
      await tx.outboxEvent.update({ where: { id: row.id }, data: { lockedAt: new Date() } });
    }
    return claimed;
  });

  if (rows.length === 0) return 0;

  const localRows = rows.filter((row) => !row.routingKey.startsWith('croip.'));
  const channel = localRows.length > 0 ? await getChannel() : undefined;
  let published = 0;

  for (const row of rows) {
    const message: EventEnvelope = {
      id: row.id,
      eventType: row.eventType,
      eventVersion: row.eventVersion,
      producer: row.headers['producer'] ?? config.serviceName,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      aggregateVersion: row.aggregateVersion,
      concessionId: row.headers['concessionId'] ?? '',
      assemblyId: row.headers['assemblyId'] ?? '',
      correlationId: row.headers['correlationId'] ?? row.id,
      causationId: row.headers['causationId'] ?? undefined,
      occurredAt: row.occurredAt.toISOString(),
      payload: row.payload,
    };

    try {
      let croipReference: string | undefined;
      if (row.routingKey.startsWith('croip.')) {
        const receipt = await submitCloudEvent(message);
        croipReference = receipt.ingestionId;
      } else {
        const accepted = channel?.publish(
          config.rabbitmqExchange,
          row.routingKey,
          Buffer.from(JSON.stringify(message)),
          { persistent: true, messageId: row.id, contentType: 'application/json' },
        );
        if (!accepted) throw new Error('RabbitMQ publish returned false');
      }

      await prisma.$transaction(async (tx) => {
        await tx.outboxEvent.update({
          where: { id: row.id },
          data: {
            publishedAt: new Date(),
            lockedAt: null,
            attempts: { increment: 1 },
            lastError: null,
          },
        });
        if (croipReference) {
          await tx.syncRecord.updateMany({
            where: {
              entityType: row.aggregateType,
              entityId: row.aggregateId,
              direction: 'UPSTREAM',
            },
            data: { status: 'SYNCED', croipReference, lastSyncedAt: new Date() },
          });
        }
      });
      published += 1;
    } catch (err) {
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: nextAttemptAt(row.attempts),
          lockedAt: null,
          lastError: err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000),
        },
      });
    }
  }

  return published;
}
