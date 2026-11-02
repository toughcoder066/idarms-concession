import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from './audit';
import { buildEnvelope } from '../../messaging/events';
import { appendOutboxEvent } from '../../messaging/outbox';
import type { AuthContext } from '../../types/global';

function present(approval: any) {
  return {
    ...approval,
    amount: approval.amount === null || approval.amount === undefined ? null : Number(approval.amount),
  };
}

export async function listApprovals(
  prisma: PrismaClient,
  scope: { concessionId: string; assemblyId?: string },
  status?: string,
) {
  const rows = await prisma.approvalRequest.findMany({
    where: {
      ...(scope.assemblyId ? { assemblyId: scope.assemblyId } : {}),
      ...(status ? { status } : {}),
      assembly: { concessions: { some: { concessionId: scope.concessionId } } },
    },
    include: { assembly: { select: { id: true, assemblyCode: true, assemblyName: true } } },
    orderBy: [{ status: 'asc' }, { slaDueAt: 'asc' }],
    take: 200,
  });
  return rows.map(present);
}

export async function decideApproval(
  prisma: PrismaClient,
  id: string,
  scope: { concessionId: string; assemblyId?: string },
  decision: 'APPROVE' | 'REJECT',
  context: { auth: AuthContext; requestId: string; note?: string },
) {
  if (scope.assemblyId && scope.assemblyId !== undefined) {
    const scoped = await prisma.approvalRequest.findFirst({ where: { id, assemblyId: scope.assemblyId } });
    if (!scoped) return { error: 'not_found' as const };
  }

  const approval = await prisma.approvalRequest.findFirst({
    where: {
      id,
      assembly: { concessions: { some: { concessionId: scope.concessionId } } },
    },
    include: {
      assembly: {
        include: {
          concessions: { where: { concessionId: scope.concessionId }, include: { contract: true } },
        },
      },
    },
  });
  if (!approval) return { error: 'not_found' as const };
  if (approval.status !== 'PENDING') return { error: 'already_resolved' as const };
  if (approval.requestedBy === context.auth.subject) return { error: 'dual_control' as const };

  if (decision === 'REJECT') {
    const rejected = await prisma.$transaction(async (tx) => {
      if (approval.requestType === 'RATE_MATRIX') {
        const fiscalYear = Number((approval.payload as { fiscalYear?: number }).fiscalYear ?? 0);
        await tx.feeFixingBylaw.updateMany({
          where: { assemblyId: approval.assemblyId, fiscalYear, status: 'PENDING_APPROVAL' },
          data: { status: 'DRAFT' },
        });
      }
      const updated = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          resolutionNote: context.note ?? null,
          resolvedBy: context.auth.subject,
          resolvedByName: context.auth.roles.length ? context.auth.roles.join(', ') : null,
          resolvedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        actorId: context.auth.subject,
        concessionId: scope.concessionId,
        assemblyId: approval.assemblyId,
        action: 'approval.rejected',
        resourceType: 'ApprovalRequest',
        resourceId: approval.id,
        requestId: context.requestId,
        outcome: 'REJECTED',
        humanReadable: `Rejected ${approval.requestType === 'RATE_MATRIX' ? 'rate matrix' : approval.requestType.toLowerCase()} for ${approval.assembly.assemblyName}.`,
        metadata: { note: context.note ?? null },
      });
      return present(updated);
    });
    return { approval: rejected };
  }

  const result = await prisma.$transaction(async (tx) => {
    let published = 0;
    if (approval.requestType === 'RATE_MATRIX') {
      const fiscalYear = Number((approval.payload as { fiscalYear?: number }).fiscalYear ?? 0);
      const rows = await tx.feeFixingBylaw.findMany({
        where: { assemblyId: approval.assemblyId, fiscalYear, status: 'PENDING_APPROVAL' },
        include: { propertyType: true, propertyUsage: true },
      });
      if (rows.length === 0) {
        return { error: 'no_pending_rates' as const };
      }
      for (const row of rows) {
        const version = row.version + 1;
        await tx.feeFixingBylaw.update({
          where: { id: row.id },
          data: {
            status: 'PUBLISHED',
            version,
            publishedAt: new Date(),
            publishedBy: context.auth.subject,
            isActive: true,
          },
        });
        const envelope = buildEnvelope({
          eventType: 'fee_fixing.published.v1',
          aggregateType: 'FeeFixingBylaw',
          aggregateId: row.id,
          aggregateVersion: version,
          concessionId: scope.concessionId,
          assemblyId: approval.assemblyId,
          correlationId: context.requestId,
          payload: {
            feeFixingId: row.id,
            assemblyId: approval.assemblyId,
            fiscalYear,
            propertyTypeCode: row.propertyType.code,
            propertyUsageCode: row.propertyUsage.code,
            baseRate: Number(row.baseRate),
            rateImpost: Number(row.rateImpost),
            minimumLevy: Number(row.minimumLevy),
            currency: row.currency,
            version,
          },
        });
        await appendOutboxEvent(tx, envelope, 'fee_fixing.published.v1');
        published += 1;
      }
    }

    const updated = await tx.approvalRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        resolutionNote: context.note ?? null,
        resolvedBy: context.auth.subject,
        resolvedByName: context.auth.roles.length ? context.auth.roles.join(', ') : null,
        resolvedAt: new Date(),
      },
    });
    await writeAudit(tx, {
      actorId: context.auth.subject,
      concessionId: scope.concessionId,
      assemblyId: approval.assemblyId,
      action: 'approval.approved',
      resourceType: 'ApprovalRequest',
      resourceId: approval.id,
      requestId: context.requestId,
      outcome: 'APPROVED',
      humanReadable: approval.requestType === 'RATE_MATRIX'
        ? `Approved and published FY${Number((approval.payload as { fiscalYear?: number }).fiscalYear ?? 0)} rate matrix for ${approval.assembly.assemblyName} (${published} rate rows).`
        : `Approved ${approval.requestType.toLowerCase()} request for ${approval.assembly.assemblyName}.`,
      metadata: { publishedRows: published, note: context.note ?? null },
    });
    return { approval: present(updated), published };
  });

  if ('error' in result) return result;
  return result;
}
