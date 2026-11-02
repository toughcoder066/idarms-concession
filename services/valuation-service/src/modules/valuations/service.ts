import type { PrismaClient } from '../../../generated/prisma';
import { readScopeWhere, type ReadScope } from '../../lib/tenancy';

export async function list(prisma: PrismaClient, scope: ReadScope) {
  return prisma.valuation.findMany({
    where: readScopeWhere(scope),
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: ReadScope) {
  return prisma.valuation.findFirst({
    where: { id, ...readScopeWhere(scope) },
  });
}
