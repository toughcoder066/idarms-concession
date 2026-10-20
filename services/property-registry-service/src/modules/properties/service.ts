import type { PrismaClient } from '../../../generated/prisma';
import { buildEnvelope } from '../../messaging/events';
import { appendOutboxEvent } from '../../messaging/outbox';

export interface TenantScope {
  concessionId?: string;
  assemblyId?: string;
}

export async function list(prisma: PrismaClient, scope: TenantScope) {
  return prisma.property.findMany({
    where: { concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: TenantScope) {
  return prisma.property.findFirst({
    where: { id, concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}

export interface VerifyInput {
  status: 'APPROVED' | 'REJECTED';
  notes?: string;
  photoUrl?: string;
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
        photoUrl: input.photoUrl ?? null,
      },
    });

    const updatedProperty = await tx.property.update({
      where: { id: property.id },
      data: { status: input.status === 'APPROVED' ? 'VERIFIED' : 'PENDING_VERIFICATION' },
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
        reference: property.reference,
        propertyType: property.propertyType,
        ratepayerId: property.ratepayerId,
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
