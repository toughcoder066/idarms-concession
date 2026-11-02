import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from './audit';
import type { AssemblyCreateInput, AssemblyUpdateInput } from './schemas';

function number(value: unknown): number {
  return Number(value ?? 0);
}

function assemblyView(assembly: any, fiscalYear: number) {
  const link = assembly.concessions?.[0];
  const contract = link?.contract;
  const targets = (assembly.targets ?? []).filter((target: any) => target.fiscalYear === fiscalYear);
  const rates = (assembly.feeFixings ?? []).filter((rate: any) => rate.fiscalYear === fiscalYear);
  const target = targets[0];
  return {
    id: assembly.id,
    assemblyCode: assembly.assemblyCode,
    assemblyName: assembly.assemblyName,
    region: assembly.region,
    croipAssemblyId: assembly.croipAssemblyId,
    status: assembly.status,
    prefixRules: assembly.prefixRules,
    logoUrl: assembly.logoUrl,
    signatureUrl: assembly.signatureUrl,
    billNotice: assembly.billNotice,
    brandingApprovedByName: assembly.brandingApprovedByName,
    brandingApprovedAt: assembly.brandingApprovedAt,
    adminEmail: assembly.adminEmail,
    adminInvitedAt: assembly.adminInvitedAt,
    isActive: assembly.isActive,
    createdAt: assembly.createdAt,
    updatedAt: assembly.updatedAt,
    contract: contract ? {
      id: contract.id,
      concessionCode: contract.concessionCode,
      concessionName: contract.concessionName,
      stateRevenueShare: number(contract.stateRevenueShare),
      concessionaireShare: number(contract.concessionaireShare),
      startDate: contract.startDate,
      endDate: contract.endDate,
      isActive: contract.isActive,
    } : null,
    target: target ? { fiscalYear: target.fiscalYear, targetAmount: number(target.targetAmount) } : null,
    rateCount: rates.length,
    publishedRateCount: rates.filter((rate: any) => rate.status === 'PUBLISHED').length,
    pendingRateCount: rates.filter((rate: any) => rate.status === 'PENDING_APPROVAL').length,
    agentCount: (assembly.agentAssignments ?? []).length,
  };
}

export async function listAssemblies(
  prisma: PrismaClient,
  scope: { concessionId: string; assemblyId?: string },
  fiscalYear: number,
) {
  const rows = await prisma.assembly.findMany({
    where: {
      ...(scope.assemblyId ? { id: scope.assemblyId } : {}),
      concessions: { some: { concessionId: scope.concessionId } },
    },
    include: {
      concessions: {
        where: { concessionId: scope.concessionId },
        include: { contract: true },
      },
      targets: { where: { fiscalYear } },
      feeFixings: { where: { fiscalYear }, select: { id: true, status: true, fiscalYear: true } },
      agentAssignments: { select: { id: true } },
    },
    orderBy: { assemblyName: 'asc' },
  });
  const totalCombinations = await prisma.propertyUsageLookup.count({ where: { isActive: true } });
  return rows.map((row) => ({ ...assemblyView(row, fiscalYear), totalCombinations }));
}

export async function getAssembly(
  prisma: PrismaClient,
  id: string,
  scope: { concessionId: string; assemblyId?: string },
  fiscalYear: number,
) {
  if (scope.assemblyId && scope.assemblyId !== id) return null;
  const row = await prisma.assembly.findFirst({
    where: {
      id,
      concessions: { some: { concessionId: scope.concessionId } },
    },
    include: {
      concessions: {
        where: { concessionId: scope.concessionId },
        include: { contract: true },
      },
      targets: { where: { fiscalYear } },
      feeFixings: { where: { fiscalYear } },
      agentAssignments: { orderBy: { assignedAt: 'desc' } },
      approvals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!row) return null;
  const totalCombinations = await prisma.propertyUsageLookup.count({ where: { isActive: true } });
  return {
    ...assemblyView(row, fiscalYear),
    totalCombinations,
    agentAssignments: row.agentAssignments,
    approvals: row.approvals.map((approval) => ({
      ...approval,
      amount: approval.amount === null ? null : number(approval.amount),
    })),
  };
}

export async function createAssembly(
  prisma: PrismaClient,
  input: AssemblyCreateInput,
  context: { actorId: string; concessionId: string; requestId: string },
) {
  const contract = await prisma.concessionContract.findUnique({ where: { id: context.concessionId } });
  if (!contract) return { error: 'contract_not_found' as const };

  return prisma.$transaction(async (tx) => {
    const assembly = await tx.assembly.create({
      data: {
        assemblyCode: input.assemblyCode,
        assemblyName: input.assemblyName,
        region: input.region,
        croipAssemblyId: input.croipAssemblyId || null,
        prefixRules: input.prefixRules ?? [],
        adminEmail: input.adminEmail || null,
        adminInvitedAt: input.adminEmail ? new Date() : null,
      },
    });
    await tx.concessionAssembly.create({
      data: { concessionId: context.concessionId, assemblyId: assembly.id },
    });
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: context.concessionId,
      assemblyId: assembly.id,
      action: 'assembly.created',
      resourceType: 'Assembly',
      resourceId: assembly.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Onboarded ${assembly.assemblyName} (${assembly.assemblyCode}) for ${contract.concessionName}.`,
      metadata: { assemblyCode: assembly.assemblyCode, region: assembly.region },
    });
    return { assembly };
  });
}

export async function updateAssembly(
  prisma: PrismaClient,
  id: string,
  scope: { concessionId: string; assemblyId?: string },
  input: AssemblyUpdateInput,
  context: { actorId: string; requestId: string },
) {
  if (scope.assemblyId && scope.assemblyId !== id) return null;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.assembly.findFirst({
      where: { id, concessions: { some: { concessionId: scope.concessionId } } },
    });
    if (!existing) return null;

    const assembly = await tx.assembly.update({
      where: { id },
      data: {
        ...(input.assemblyName !== undefined ? { assemblyName: input.assemblyName } : {}),
        ...(input.region !== undefined ? { region: input.region } : {}),
        ...(input.croipAssemblyId !== undefined ? { croipAssemblyId: input.croipAssemblyId || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.prefixRules !== undefined ? { prefixRules: input.prefixRules } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl || null } : {}),
        ...(input.signatureUrl !== undefined ? { signatureUrl: input.signatureUrl || null } : {}),
        ...(input.billNotice !== undefined ? { billNotice: input.billNotice || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.brandingApprovedByName
          ? { brandingApprovedByName: input.brandingApprovedByName, brandingApprovedAt: new Date() }
          : {}),
        ...(input.adminEmail !== undefined
          ? {
            adminEmail: input.adminEmail || null,
            adminInvitedAt: input.adminEmail ? (existing.adminInvitedAt ?? new Date()) : null,
          }
          : {}),
      },
    });
    const changes = Object.keys(input).filter((key) => input[key as keyof AssemblyUpdateInput] !== undefined);
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: scope.concessionId,
      assemblyId: assembly.id,
      action: 'assembly.updated',
      resourceType: 'Assembly',
      resourceId: assembly.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Updated ${assembly.assemblyName}: ${changes.join(', ')}.`,
      metadata: { changes },
    });
    return assembly;
  });
}
