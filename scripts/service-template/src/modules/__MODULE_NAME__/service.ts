import type { PrismaClient } from '../../../generated/prisma';
import { readScopeWhere, type ReadScope } from '../../lib/tenancy';

export async function list(prisma: PrismaClient, scope: ReadScope) {
  return prisma.__MODEL_KEY__.findMany({
    where: __LIST_WHERE__,
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: ReadScope) {
  return prisma.__MODEL_KEY__.findFirst({
    where: __GET_WHERE__,
  });
}
