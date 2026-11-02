import type { Prisma, PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { getChannel } from './rabbit';
import type { EventEnvelope } from './events';

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
 * Claim and publish a batch of committed outbox events using SKIP LOCKED
 * semantics, then mark them published only after the broker accepts them.
 */
export async function publishDueOutbox(prisma: PrismaClient, batchSize = 100): Promise<number> {
  const rows = await prisma.$transaction(async (tx) => {
    return tx.$queryRaw<OutboxRow[]>`
      SELECT "id", "eventType", "eventVersion", "aggregateType", "aggregateId",
             "aggregateVersion", "routingKey", "payload", "headers", "occurredAt", "attempts"
      FROM outbox_events
      WHERE "publishedAt" IS NULL AND "nextAttemptAt" <= now()
      ORDER BY "occurredAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;
  });

  if (rows.length === 0) return 0;

  const channel = await getChannel();
  let published = 0;

  for (const row of rows) {
    const message: EventEnvelope = {
      id: row.id,
      eventType: row.eventType,
      eventVersion: row.eventVersion,
      producer: config.serviceName,
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

    const ok = channel.publish(
      config.rabbitmqExchange,
      row.routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, messageId: row.id, contentType: 'application/json' },
    );

    if (ok) {
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { publishedAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      published += 1;
    } else {
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: nextAttemptAt(row.attempts),
          lastError: 'publish_returned_false',
        },
      });
    }
  }

  return published;
}
