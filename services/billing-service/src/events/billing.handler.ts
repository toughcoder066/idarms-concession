import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { appendOutboxEvent } from '../messaging/outbox';
import { buildEnvelope, type EventEnvelope } from '../messaging/events';

const valuationCompletedSchema = z.object({
  valuationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  propertyType: z.string().optional(),
  propertyUsage: z.string().optional(),
  marketValue: z.number().optional(),
  taxableValue: z.number(),
  fiscalYear: z.number().int(),
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function findFeeFixing(
  tx: Prisma.TransactionClient,
  assemblyId: string,
  fiscalYear: number,
  propertyTypeCode: string,
  propertyUsageCode: string,
) {
  const exact = await tx.feeFixingReplica.findUnique({
    where: {
      assemblyId_fiscalYear_propertyTypeCode_propertyUsageCode: {
        assemblyId,
        fiscalYear,
        propertyTypeCode,
        propertyUsageCode,
      },
    },
  });
  if (exact) return exact;

  return tx.feeFixingReplica.findUnique({
    where: {
      assemblyId_fiscalYear_propertyTypeCode_propertyUsageCode: {
        assemblyId,
        fiscalYear,
        propertyTypeCode,
        propertyUsageCode: 'GENERAL',
      },
    },
  });
}

/**
 * A valuation makes a property billable. The bill uses the assembly's
 * fee-fixing bylaw when one has been replicated; otherwise it falls back to the
 * taxable value as a zero-impost base rate so the operational flow still works.
 */
export async function handleValuationCompleted(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = valuationCompletedSchema.parse(event.payload);
  const propertyType = payload.propertyType ?? 'UNCLASSIFIED';
  const propertyUsage = payload.propertyUsage ?? 'GENERAL';
  const fiscalYear = payload.fiscalYear;

  await tx.valuationReplica.upsert({
    where: { propertyId: payload.propertyId },
    create: {
      id: payload.valuationId,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyId: payload.propertyId,
      propertyType,
      propertyUsage,
      taxableValue: payload.taxableValue,
      fiscalYear,
      syncedAt: new Date(),
    },
    update: {
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyType,
      propertyUsage,
      taxableValue: payload.taxableValue,
      fiscalYear,
      syncedAt: new Date(),
    },
  });

  const feeFixing = await findFeeFixing(tx, event.assemblyId, fiscalYear, propertyType, propertyUsage);
  const ratableValue = payload.taxableValue;
  const baseRate = feeFixing ? Number(feeFixing.baseRate) : ratableValue;
  const rateImpost = feeFixing ? Number(feeFixing.rateImpost) : 0;
  const subTotal = round2(baseRate + ratableValue * rateImpost);
  const totalAmount = subTotal;

  const billNumber = `BL-${fiscalYear}-${payload.propertyId.slice(0, 8).toUpperCase()}`;
  const dueDate = new Date(Date.UTC(fiscalYear, 11, 31));

  const bill = await tx.bill.upsert({
    where: { propertyId_fiscalYear: { propertyId: payload.propertyId, fiscalYear } },
    create: {
      billNumber,
      concessionId: event.concessionId,
      assemblyId: event.assemblyId,
      propertyId: payload.propertyId,
      fiscalYear,
      ratableValue,
      baseRate,
      rateImpost,
      subTotal,
      penaltyAmount: 0,
      discountAmount: 0,
      totalAmount,
      amountPaid: 0,
      currency: feeFixing?.currency ?? 'GHS',
      status: 'UNPAID',
      dueDate,
    },
    update: {
      ratableValue,
      baseRate,
      rateImpost,
      subTotal,
      totalAmount,
      currency: feeFixing?.currency ?? 'GHS',
      dueDate,
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
      fiscalYear: bill.fiscalYear,
      subTotal: Number(bill.subTotal),
      totalAmount: Number(bill.totalAmount),
      amountDue: Number(bill.totalAmount),
      amountPaid: Number(bill.amountPaid),
      currency: bill.currency,
      dueDate: bill.dueDate.toISOString(),
    },
  });

  await appendOutboxEvent(tx, envelope, 'bill.issued.v1');
}
