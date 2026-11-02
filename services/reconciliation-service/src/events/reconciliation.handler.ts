import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { appendOutboxEvent } from '../messaging/outbox';
import { buildEnvelope, type EventEnvelope } from '../messaging/events';

const billIssuedSchema = z.object({
  billId: z.string().uuid(),
  billNumber: z.string().optional(),
  propertyId: z.string().uuid().optional(),
  fiscalYear: z.number().int().optional(),
  totalAmount: z.number().optional(),
  amountDue: z.number().optional(),
  amountPaid: z.number().optional(),
  currency: z.string().default('GHS'),
  status: z.string().optional(),
});

const paymentCollectedSchema = z.object({
  paymentId: z.string().uuid(),
  billId: z.string().uuid(),
  amount: z.number(),
  currency: z.string().default('GHS'),
  status: z.string(),
});

export async function handleBillIssued(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = billIssuedSchema.parse(event.payload);
  const totalAmount = payload.totalAmount ?? payload.amountDue;
  if (totalAmount === undefined) {
    throw new Error('bill.issued.v1 payload is missing totalAmount/amountDue');
  }

  await tx.billReplica.upsert({
    where: { id: payload.billId },
    create: {
      id: payload.billId,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyId: payload.propertyId ?? '00000000-0000-0000-0000-000000000000',
      fiscalYear: payload.fiscalYear ?? 0,
      totalAmount,
      amountPaid: payload.amountPaid ?? 0,
      currency: payload.currency,
      status: payload.status ?? 'UNPAID',
      syncedAt: new Date(),
    },
    update: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyId: payload.propertyId ?? '00000000-0000-0000-0000-000000000000',
      fiscalYear: payload.fiscalYear ?? 0,
      totalAmount,
      amountPaid: payload.amountPaid ?? 0,
      currency: payload.currency,
      status: payload.status ?? 'UNPAID',
      syncedAt: new Date(),
    },
  });
}

export async function handlePaymentCollected(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = paymentCollectedSchema.parse(event.payload);

  await tx.paymentReplica.upsert({
    where: { id: payload.paymentId },
    create: {
      id: payload.paymentId,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      billId: payload.billId,
      amount: payload.amount,
      currency: payload.currency,
      status: payload.status,
      syncedAt: new Date(),
    },
    update: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      amount: payload.amount,
      currency: payload.currency,
      status: payload.status,
      syncedAt: new Date(),
    },
  });

  const bill = await tx.billReplica.findUnique({ where: { id: payload.billId } });

  let reason: 'AMOUNT_MISMATCH' | 'UNMATCHED_PAYMENT' | null = null;
  if (!bill) {
    reason = 'UNMATCHED_PAYMENT';
  } else {
    const totalAmount = Number(bill.totalAmount);
    const remaining = Math.max(0, totalAmount - Number(bill.amountPaid));
    if (payload.amount > remaining + 0.005) {
      reason = 'AMOUNT_MISMATCH';
    } else {
      const amountPaid = Number(bill.amountPaid) + payload.amount;
      await tx.billReplica.update({
        where: { id: bill.id },
        data: {
          amountPaid,
          status: amountPaid >= totalAmount ? 'PAID' : 'PARTIALLY_PAID',
        },
      });
    }
  }

  if (!reason) return;

  const existing = await tx.discrepancy.findFirst({
    where: { billId: payload.billId, paymentId: payload.paymentId, reason },
  });
  if (existing) return;

  const discrepancy = await tx.discrepancy.create({
    data: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      billId: payload.billId,
      paymentId: payload.paymentId,
      reason,
    },
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
