import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

const feeFixingPublishedSchema = z.object({
  feeFixingId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  fiscalYear: z.number().int(),
  propertyTypeCode: z.string().min(1),
  propertyUsageCode: z.string().min(1),
  baseRate: z.number(),
  rateImpost: z.number(),
  currency: z.string().default('GHS'),
  version: z.number().int().optional(),
});

/**
 * Local replica of the concessions-management-service catalogue. Billing never
 * reads another service's database; it applies the published bylaw revision.
 */
export async function handleFeeFixingPublished(
  tx: Prisma.TransactionClient,
  event: EventEnvelope,
): Promise<void> {
  const payload = feeFixingPublishedSchema.parse(event.payload);

  await tx.feeFixingReplica.upsert({
    where: {
      assemblyId_fiscalYear_propertyTypeCode_propertyUsageCode: {
        assemblyId: payload.assemblyId,
        fiscalYear: payload.fiscalYear,
        propertyTypeCode: payload.propertyTypeCode,
        propertyUsageCode: payload.propertyUsageCode,
      },
    },
    create: {
      id: payload.feeFixingId,
      assemblyId: payload.assemblyId,
      fiscalYear: payload.fiscalYear,
      propertyTypeCode: payload.propertyTypeCode,
      propertyUsageCode: payload.propertyUsageCode,
      baseRate: payload.baseRate,
      rateImpost: payload.rateImpost,
      currency: payload.currency,
      sourceVersion: payload.version ?? 1,
      syncedAt: new Date(),
    },
    update: {
      id: payload.feeFixingId,
      baseRate: payload.baseRate,
      rateImpost: payload.rateImpost,
      currency: payload.currency,
      sourceVersion: payload.version ?? 1,
      syncedAt: new Date(),
    },
  });
}
