import type { Prisma, PrismaClient } from '../../../generated/prisma';

export interface AuditInput {
  actorId: string;
  actorRole?: string;
  actorName?: string;
  actorEmail?: string;
  concessionId?: string;
  assemblyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId: string;
  outcome: string;
  humanReadable: string;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(tx: Prisma.TransactionClient, input: AuditInput): Promise<void> {
  const metadata = input.metadata ?? {};
  const metadataRole = typeof metadata.actorRole === 'string' ? metadata.actorRole : undefined;
  await tx.auditRecord.create({
    data: {
      actorId: input.actorId,
      actorType: 'user',
      concessionId: input.concessionId ?? null,
      assemblyId: input.assemblyId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      requestId: input.requestId,
      outcome: input.outcome,
      metadata: {
        ...metadata,
        humanReadable: input.humanReadable,
        actorRole: input.actorRole ?? metadataRole ?? 'UNKNOWN',
        ...(input.actorName ? { actorName: input.actorName } : {}),
        ...(input.actorEmail ? { actorEmail: input.actorEmail } : {}),
      } as Prisma.InputJsonValue,
    },
  });
}

export async function listAudit(
  prisma: PrismaClient,
  scope: { concessionId: string; assemblyId?: string },
  limit = 200,
) {
  return prisma.auditRecord.findMany({
    where: {
      concessionId: scope.concessionId,
      ...(scope.assemblyId ? { assemblyId: scope.assemblyId } : {}),
    },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(limit, 500),
  });
}
