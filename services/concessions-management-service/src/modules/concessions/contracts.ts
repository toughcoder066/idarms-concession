import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from './audit';
import type { ContractCreateInput, ContractUpdateInput } from './schemas';

function number(value: unknown): number {
  return Number(value ?? 0);
}

function present<T extends { stateRevenueShare: unknown; concessionaireShare: unknown }>(contract: T) {
  return {
    ...contract,
    stateRevenueShare: number(contract.stateRevenueShare),
    concessionaireShare: number(contract.concessionaireShare),
  };
}

export async function listContracts(prisma: PrismaClient, concessionId: string) {
  const rows = await prisma.concessionContract.findMany({
    where: { id: concessionId },
    include: {
      assemblies: {
        include: { assembly: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({
    ...present(row),
    assemblyCount: row.assemblies.length,
    assemblies: row.assemblies.map((link) => ({
      id: link.assembly.id,
      assemblyCode: link.assembly.assemblyCode,
      assemblyName: link.assembly.assemblyName,
      region: link.assembly.region,
      status: link.assembly.status,
    })),
  }));
}

export async function getContract(prisma: PrismaClient, id: string, concessionId: string) {
  if (id !== concessionId) return null;
  const row = await prisma.concessionContract.findUnique({
    where: { id },
    include: { assemblies: { include: { assembly: true } } },
  });
  if (!row) return null;
  return {
    ...present(row),
    assemblyCount: row.assemblies.length,
    assemblies: row.assemblies.map((link) => link.assembly),
  };
}

export async function createContract(
  prisma: PrismaClient,
  input: ContractCreateInput,
  context: { actorId: string; concessionId: string; requestId: string },
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.concessionContract.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        concessionCode: input.concessionCode,
        concessionName: input.concessionName,
        stateRevenueShare: input.stateRevenueShare,
        concessionaireShare: input.concessionaireShare,
        startDate: input.startDate,
        endDate: input.endDate,
        isActive: input.isActive ?? true,
      },
    });
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: input.id ?? context.concessionId,
      action: 'contract.created',
      resourceType: 'ConcessionContract',
      resourceId: contract.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Created concession contract ${contract.concessionCode} (${contract.concessionName}).`,
      metadata: {
        stateRevenueShare: input.stateRevenueShare,
        concessionaireShare: input.concessionaireShare,
      },
    });
    return present(contract);
  });
}

export async function updateContract(
  prisma: PrismaClient,
  id: string,
  concessionId: string,
  input: ContractUpdateInput,
  context: { actorId: string; requestId: string },
) {
  if (id !== concessionId) return null;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.concessionContract.findUnique({ where: { id } });
    if (!existing) return null;
    const contract = await tx.concessionContract.update({
      where: { id },
      data: {
        ...(input.concessionName !== undefined ? { concessionName: input.concessionName } : {}),
        ...(input.stateRevenueShare !== undefined ? { stateRevenueShare: input.stateRevenueShare } : {}),
        ...(input.concessionaireShare !== undefined ? { concessionaireShare: input.concessionaireShare } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    const changes = Object.keys(input).filter((key) => input[key as keyof ContractUpdateInput] !== undefined);
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId,
      action: 'contract.updated',
      resourceType: 'ConcessionContract',
      resourceId: contract.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Updated concession contract ${contract.concessionCode}: ${changes.join(', ')}.`,
      metadata: { changes },
    });
    return present(contract);
  });
}
