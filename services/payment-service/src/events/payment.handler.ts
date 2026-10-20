import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

const billIssuedSchema = z.object({
  billId: z.string().uuid(),
  billNumber: z.string(),
  propertyId: z.string().uuid(),
  amountDue: z.number(),
  fiscalYear: z.number().int(),
});

export async function handleBillIssued(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = billIssuedSchema.parse(event.payload);

  await tx.billReplica.upsert({
    where: { id: payload.billId },
    create: {
      id: payload.billId,
      assemblyId: event.assemblyId,
      amountDue: payload.amountDue,
      status: 'ISSUED',
    },
    update: { amountDue: payload.amountDue, status: 'ISSUED' },
  });
}
