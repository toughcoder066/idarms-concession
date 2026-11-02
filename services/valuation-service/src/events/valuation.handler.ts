import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { appendOutboxEvent } from '../messaging/outbox';
import { buildEnvelope, type EventEnvelope } from '../messaging/events';

const propertyVerifiedSchema = z.object({
  propertyId: z.string().uuid(),
  verificationId: z.string().uuid(),
  reference: z.string().optional(),
  propertyType: z.string().optional(),
  propertyUsage: z.string().optional(),
  status: z.enum(['APPROVED', 'REJECTED', 'NEEDS_CORRECTION']),
  verifiedAt: z.string().datetime(),
});

// Scaffold assessment rules. Replace with the approved rating formula.
const MARKET_VALUE_BY_TYPE: Record<string, number> = {
  RESIDENTIAL: 120000,
  COMMERCIAL: 280000,
  INDUSTRIAL: 450000,
  MIXED_USE: 320000,
  GOVERNMENTAL: 500000,
  AGRICULTURAL: 60000,
  UNCLASSIFIED: 120000,
};
const TAXABLE_RATE = 0.75;

export async function handlePropertyVerified(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = propertyVerifiedSchema.parse(event.payload);
  const propertyType = payload.propertyType ?? 'UNCLASSIFIED';
  const propertyUsage = payload.propertyUsage ?? 'GENERAL';
  const replicaStatus = payload.status === 'APPROVED' ? 'VERIFIED' : 'SUBMITTED';

  await tx.propertyReplica.upsert({
    where: { id: payload.propertyId },
    create: {
      id: payload.propertyId,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyType,
      propertyUsage,
      status: replicaStatus,
      lastSyncedAt: new Date(),
    },
    update: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyType,
      propertyUsage,
      status: replicaStatus,
      lastSyncedAt: new Date(),
    },
  });

  if (payload.status !== 'APPROVED') {
    return;
  }

  const fiscalYear = new Date().getFullYear();
  const baseValue = MARKET_VALUE_BY_TYPE[propertyType] ?? MARKET_VALUE_BY_TYPE.UNCLASSIFIED;
  const marketValue = Math.round(baseValue * 100) / 100;
  const taxableValue = Math.round(marketValue * TAXABLE_RATE * 100) / 100;

  const valuation = await tx.valuation.upsert({
    where: { propertyId: payload.propertyId },
    create: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyId: payload.propertyId,
      propertyType,
      propertyUsage,
      marketValue,
      taxableValue,
      fiscalYear,
      basis: 'SCAFFOLD_MARKET_VALUE',
    },
    update: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyType,
      propertyUsage,
      marketValue,
      taxableValue,
      fiscalYear,
    },
  });

  const envelope = buildEnvelope({
    eventType: 'property.valuation_completed.v1',
    aggregateType: 'Valuation',
    aggregateId: valuation.id,
    aggregateVersion: 1,
    concessionId: event.concessionId,
    assemblyId: event.assemblyId,
    correlationId: event.correlationId,
    causationId: event.id,
    payload: {
      valuationId: valuation.id,
      propertyId: payload.propertyId,
      propertyType: valuation.propertyType,
      propertyUsage: valuation.propertyUsage,
      marketValue: Number(valuation.marketValue),
      taxableValue: Number(valuation.taxableValue),
      fiscalYear: valuation.fiscalYear,
    },
  });

  await appendOutboxEvent(tx, envelope, 'property.valuation_completed.v1');
}
