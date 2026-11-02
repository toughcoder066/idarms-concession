import type { PrismaClient } from '../../../generated/prisma';

export interface TenantScope {
  concessionId: string;
  assemblyId: string;
}

export async function list(prisma: PrismaClient, scope: TenantScope) {
  return prisma.ratepayer.findMany({
    where: { concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: TenantScope) {
  return prisma.ratepayer.findFirst({
    where: { id, concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}
