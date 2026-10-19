import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

const ratepayerRegisteredSchema = z.object({
  id: z.string().uuid().optional(),
  reference: z.string().min(1),
  fullName: z.string().min(1),
  ghanaCardId: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  status: z.string().default('ACTIVE'),
});

/**
 * Downstream sync: CROIP registered a ratepayer, the bridge re-published the
 * event onto idarms.events, and this service upserts its read-only replica.
 */
export async function upsertRatepayer(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = ratepayerRegisteredSchema.parse(event.payload);
  const id = payload.id ?? event.aggregateId;
  const lastSyncedAt = new Date();

  await tx.ratepayer.upsert({
    where: { id },
    create: {
      id,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      reference: payload.reference,
      fullName: payload.fullName,
      ghanaCardId: payload.ghanaCardId ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      status: payload.status,
      lastSyncedAt,
    },
    update: {
      reference: payload.reference,
      fullName: payload.fullName,
      ghanaCardId: payload.ghanaCardId ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      status: payload.status,
      lastSyncedAt,
    },
  });
}
