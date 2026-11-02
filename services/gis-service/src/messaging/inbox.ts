import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../../generated/prisma';
import type { EventEnvelope } from './events';

type TxClient = Prisma.TransactionClient;

/**
 * Idempotent event processing. RabbitMQ can deliver the same message more than
 * once; a duplicate event ID must never create a second business effect.
 */
export async function processOnce<T>(
  prisma: PrismaClient,
  consumerId: string,
  envelope: EventEnvelope,
  handler: (tx: TxClient, event: EventEnvelope) => Promise<T>,
): Promise<T | undefined> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inboxMessage.findUnique({
      where: { consumerId_messageId: { consumerId, messageId: envelope.id } },
    });

    if (existing) {
      return existing.result as unknown as T | undefined;
    }

    const result = await handler(tx, envelope);

    const data: Prisma.InboxMessageUncheckedCreateInput = {
      id: randomUUID(),
      consumerId,
      messageId: envelope.id,
      eventType: envelope.eventType,
      receivedAt: new Date(),
      processedAt: new Date(),
    };

    if (result !== undefined && result !== null) {
      data.result = result as Prisma.InputJsonValue;
    }

    await tx.inboxMessage.create({ data });

    return result;
  });
}
