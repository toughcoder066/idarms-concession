import type { PrismaClient } from '../../../generated/prisma';
import { readScopeWhere, type ReadScope } from '../../lib/tenancy';

export async function list(prisma: PrismaClient, scope: ReadScope) {
  return prisma.discrepancy.findMany({
    where: readScopeWhere(scope),
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: ReadScope) {
  return prisma.discrepancy.findFirst({
    where: { id, ...readScopeWhere(scope) },
  });
}
