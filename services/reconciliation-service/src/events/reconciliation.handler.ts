import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { appendOutboxEvent } from '../messaging/outbox';
import { buildEnvelope, type EventEnvelope } from '../messaging/events';

const billIssuedSchema = z.object({
  billId: z.string().uuid(),
  billNumber: z.string(),
  amountDue: z.number(),
});

const paymentCollectedSchema = z.object({
  paymentId: z.string().uuid(),
  billId: z.string().uuid(),
  amount: z.number(),
  status: z.string(),
});

export async function handleBillIssued(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = billIssuedSchema.parse(event.payload);

  await tx.billReplica.upsert({
    where: { id: payload.billId },
    create: { id: payload.billId, amountDue: payload.amountDue },
    update: { amountDue: payload.amountDue },
  });
}

export async function handlePaymentCollected(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = paymentCollectedSchema.parse(event.payload);

  await tx.paymentReplica.upsert({
    where: { id: payload.paymentId },
    create: { id: payload.paymentId, billId: payload.billId, amount: payload.amount, status: payload.status },
    update: { amount: payload.amount, status: payload.status },
  });

  const bill = await tx.billReplica.findUnique({ where: { id: payload.billId } });

  let reason: 'AMOUNT_MISMATCH' | 'UNMATCHED_PAYMENT' | null = null;
  if (!bill) {
    reason = 'UNMATCHED_PAYMENT';
  } else if (Number(bill.amountDue) !== payload.amount) {
    reason = 'AMOUNT_MISMATCH';
  }

  if (!reason) return;

  const existing = await tx.discrepancy.findFirst({
    where: { billId: payload.billId, paymentId: payload.paymentId, reason },
  });
  if (existing) return;

  const discrepancy = await tx.discrepancy.create({
    data: { billId: payload.billId, paymentId: payload.paymentId, reason },
  });

  const envelope = buildEnvelope({
    eventType: 'reconciliation.discrepancy_detected.v1',
    aggregateType: 'Discrepancy',
    aggregateId: discrepancy.id,
    aggregateVersion: 1,
    concessionId: event.concessionId,
    assemblyId: event.assemblyId,
    correlationId: event.correlationId,
    causationId: event.id,
    payload: {
      discrepancyId: discrepancy.id,
      billId: payload.billId,
      paymentId: payload.paymentId,
      reason,
    },
  });

  await appendOutboxEvent(tx, envelope, 'reconciliation.discrepancy_detected.v1');
}
