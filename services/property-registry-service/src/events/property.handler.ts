import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

const propertyRegisteredSchema = z.object({
  id: z.string().uuid().optional(),
  reference: z.string().min(1),
  ratepayerId: z.string().uuid(),
  propertyType: z.string().min(1),
  gpsCoordinates: z.string().nullable().optional(),
  status: z.string().default('PENDING_VERIFICATION'),
});

/**
 * Downstream sync: CROIP registered a property, the bridge re-published the
 * event onto idarms.events, and this service upserts its local replica.
 */
export async function upsertProperty(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = propertyRegisteredSchema.parse(event.payload);
  const id = payload.id ?? event.aggregateId;
  const lastSyncedAt = new Date();

  await tx.property.upsert({
    where: { id },
    create: {
      id,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      reference: payload.reference,
      ratepayerId: payload.ratepayerId,
      propertyType: payload.propertyType,
      gpsCoordinates: payload.gpsCoordinates ?? null,
      status: payload.status,
      lastSyncedAt,
    },
    update: {
      reference: payload.reference,
      ratepayerId: payload.ratepayerId,
      propertyType: payload.propertyType,
      gpsCoordinates: payload.gpsCoordinates ?? null,
      status: payload.status,
      lastSyncedAt,
    },
  });
}
