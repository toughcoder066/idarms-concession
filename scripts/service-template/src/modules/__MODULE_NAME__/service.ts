import type { PrismaClient } from '../../../generated/prisma';

export interface TenantScope {
  concessionId?: string;
  assemblyId?: string;
}

export async function list(prisma: PrismaClient, scope: TenantScope) {
  return prisma.__MODEL_KEY__.findMany({
    where: __LIST_WHERE__,
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: TenantScope) {
  return prisma.__MODEL_KEY__.findFirst({
    where: __GET_WHERE__,
  });
}
