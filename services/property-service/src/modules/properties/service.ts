import type { PrismaClient } from '../../../generated/prisma';
import { readScopeWhere, type ReadScope } from '../../lib/tenancy';
import { buildEnvelope } from '../../messaging/events';
import { appendOutboxEvent } from '../../messaging/outbox';

export async function list(prisma: PrismaClient, scope: ReadScope) {
  return prisma.property.findMany({
    where: readScopeWhere(scope),
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: ReadScope) {
  return prisma.property.findFirst({
    where: { id, ...readScopeWhere(scope) },
  });
}

export interface VerifyInput {
  status: 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION';
  notes?: string;
  photoDocumentId?: string;
}

export interface VerifyContext {
  propertyId: string;
  agentId: string;
  concessionId: string;
  assemblyId: string;
  correlationId: string;
}

/**
 * Field-agent verification: writes the verification, flips property status and
 * emits property.verified.v1 through the transactional outbox in one commit.
 */
export async function verify(prisma: PrismaClient, input: VerifyInput, context: VerifyContext) {
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.findFirst({
      where: {
        id: context.propertyId,
        concessionId: context.concessionId,
        assemblyId: context.assemblyId,
      },
    });
    if (!property) return null;

    const verification = await tx.fieldVerification.create({
      data: {
        propertyId: property.id,
        agentId: context.agentId,
        status: input.status,
        notes: input.notes ?? null,
        photoDocumentId: input.photoDocumentId ?? null,
      },
    });

    const approved = input.status === 'APPROVED';
    const updatedProperty = await tx.property.update({
      where: { id: property.id },
      data: {
        status: approved ? 'VERIFIED' : 'SUBMITTED',
        verifiedBy: approved ? context.agentId : null,
        verifiedAt: approved ? verification.verifiedAt : null,
        version: { increment: 1 },
      },
    });

    const envelope = buildEnvelope({
      eventType: 'property.verified.v1',
      aggregateType: 'Property',
      aggregateId: property.id,
      aggregateVersion: 1,
      concessionId: context.concessionId,
      assemblyId: context.assemblyId,
      correlationId: context.correlationId,
      payload: {
        propertyId: property.id,
        verificationId: verification.id,
        reference: property.externalPropertyId,
        externalPropertyId: property.externalPropertyId,
        croipPropertyId: property.croipPropertyId,
        propertyType: property.propertyType,
        propertyUsage: property.propertyUsage,
        ratepayerRef: property.ratepayerRef,
        ratableValue: property.ratableValue === null ? null : Number(property.ratableValue),
        status: input.status,
        verifiedAt: verification.verifiedAt.toISOString(),
      },
    });

    await appendOutboxEvent(tx, envelope, 'property.verified.v1');

    await tx.auditRecord.create({
      data: {
        actorId: context.agentId,
        actorType: 'field-agent',
        concessionId: context.concessionId,
        assemblyId: context.assemblyId,
        action: 'property.verified',
        resourceType: 'Property',
        resourceId: property.id,
        requestId: context.correlationId,
        outcome: input.status,
        metadata: { verificationId: verification.id },
      },
    });

    return { property: updatedProperty, verification };
  });
}
