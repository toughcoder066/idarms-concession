import type { PrismaClient } from '../../../generated/prisma';

export async function listLookups(prisma: PrismaClient) {
  return prisma.propertyTypeLookup.findMany({
    where: { isActive: true },
    include: {
      usages: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
}
