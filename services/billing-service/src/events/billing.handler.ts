import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { appendOutboxEvent } from '../messaging/outbox';
import { buildEnvelope, type EventEnvelope } from '../messaging/events';

const valuationCompletedSchema = z.object({
  valuationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  marketValue: z.number().optional(),
  taxableValue: z.number(),
  fiscalYear: z.number().int(),
});

export async function handleValuationCompleted(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = valuationCompletedSchema.parse(event.payload);

  await tx.valuationReplica.upsert({
    where: { propertyId: payload.propertyId },
    create: {
      id: payload.valuationId,
      propertyId: payload.propertyId,
      assemblyId: event.assemblyId,
      taxableValue: payload.taxableValue,
    },
    update: { assemblyId: event.assemblyId, taxableValue: payload.taxableValue },
  });

  const billNumber = `BL-${payload.fiscalYear}-${payload.propertyId.slice(0, 8).toUpperCase()}`;

  const bill = await tx.bill.upsert({
    where: { billNumber },
    create: {
      billNumber,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyId: payload.propertyId,
      amountDue: payload.taxableValue,
      amountPaid: 0,
      status: 'ISSUED',
      fiscalYear: payload.fiscalYear,
    },
    update: {
      amountDue: payload.taxableValue,
      fiscalYear: payload.fiscalYear,
    },
  });

  const envelope = buildEnvelope({
    eventType: 'bill.issued.v1',
    aggregateType: 'Bill',
    aggregateId: bill.id,
    aggregateVersion: 1,
    concessionId: event.concessionId,
    assemblyId: event.assemblyId,
    correlationId: event.correlationId,
    causationId: event.id,
    payload: {
      billId: bill.id,
      billNumber: bill.billNumber,
      propertyId: bill.propertyId,
      amountDue: Number(bill.amountDue),
      fiscalYear: bill.fiscalYear,
    },
  });

  await appendOutboxEvent(tx, envelope, 'bill.issued.v1');
}
