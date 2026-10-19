import type { PrismaClient } from '../../../generated/prisma';

export interface TenantScope {
  concessionId?: string;
  assemblyId?: string;
}

export async function list(prisma: PrismaClient, scope: TenantScope) {
  return prisma.discrepancy.findMany({
    where: {},
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: TenantScope) {
  return prisma.discrepancy.findFirst({
    where: { id },
  });
}
