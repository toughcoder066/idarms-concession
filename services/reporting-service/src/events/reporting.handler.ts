import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

const propertyVerifiedSchema = z.object({
  propertyId: z.string().uuid(),
  status: z.string(),
});

const billIssuedSchema = z.object({
  billId: z.string().uuid(),
  amountDue: z.number(),
});

const paymentCollectedSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number(),
});

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function upsertMetric(
  tx: Prisma.TransactionClient,
  event: EventEnvelope,
  increments: { propertiesVerified?: number; totalBilled?: number; totalCollected?: number },
): Promise<void> {
  const date = todayUtc();

  await tx.dashboardMetric.upsert({
    where: {
      concessionId_assemblyId_date: {
        concessionId: event.concessionId,
        assemblyId: event.assemblyId,
        date,
      },
    },
    create: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      date,
      propertiesVerified: increments.propertiesVerified ?? 0,
      totalBilled: increments.totalBilled ?? 0,
      totalCollected: increments.totalCollected ?? 0,
    },
    update: {
      propertiesVerified: { increment: increments.propertiesVerified ?? 0 },
      totalBilled: { increment: increments.totalBilled ?? 0 },
      totalCollected: { increment: increments.totalCollected ?? 0 },
    },
  });
}

export async function handlePropertyVerified(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = propertyVerifiedSchema.parse(event.payload);
  if (payload.status !== 'APPROVED') return;
  await upsertMetric(tx, event, { propertiesVerified: 1 });
}

export async function handleBillIssued(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = billIssuedSchema.parse(event.payload);
  await upsertMetric(tx, event, { totalBilled: payload.amountDue });
}

export async function handlePaymentCollected(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = paymentCollectedSchema.parse(event.payload);
  await upsertMetric(tx, event, { totalCollected: payload.amount });
}
