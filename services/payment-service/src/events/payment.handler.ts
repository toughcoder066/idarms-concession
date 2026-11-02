import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

const billIssuedSchema = z.object({
  billId: z.string().uuid(),
  billNumber: z.string(),
  propertyId: z.string().uuid(),
  totalAmount: z.number().optional(),
  amountDue: z.number().optional(),
  amountPaid: z.number().optional(),
  currency: z.string().default('GHS'),
  status: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  fiscalYear: z.number().int(),
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
      propertyId: payload.propertyId,
      fiscalYear: payload.fiscalYear,
      totalAmount,
      amountPaid: payload.amountPaid ?? 0,
      currency: payload.currency,
      status: payload.status ?? 'UNPAID',
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      syncedAt: new Date(),
    },
    update: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyId: payload.propertyId,
      fiscalYear: payload.fiscalYear,
      totalAmount,
      amountPaid: payload.amountPaid ?? 0,
      currency: payload.currency,
      status: payload.status ?? 'UNPAID',
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      syncedAt: new Date(),
    },
  });
}
