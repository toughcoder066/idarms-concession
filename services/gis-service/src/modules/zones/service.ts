import type { Prisma, PrismaClient } from '../../../generated/prisma';

export interface TenantScope {
  concessionId?: string;
  assemblyId?: string;
}

export async function list(prisma: PrismaClient, scope: TenantScope) {
  if (!scope.concessionId) return [];
  return prisma.spatialZone.findMany({
    where: {
      concessionId: scope.concessionId,
      ...(scope.assemblyId ? { assemblyId: scope.assemblyId } : {}),
    },
    include: { _count: { select: { blocks: true } } },
    orderBy: [{ assemblyId: 'asc' }, { zoneCode: 'asc' }],
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: TenantScope) {
  if (!scope.concessionId) return null;
  return prisma.spatialZone.findFirst({
    where: {
      id,
      concessionId: scope.concessionId,
      ...(scope.assemblyId ? { assemblyId: scope.assemblyId } : {}),
    },
  });
}

export async function listBlocks(prisma: PrismaClient, zoneId: string, scope: TenantScope) {
  if (!scope.concessionId) return [];
  return prisma.spatialBlock.findMany({
    where: {
      zoneId,
      concessionId: scope.concessionId,
      ...(scope.assemblyId ? { assemblyId: scope.assemblyId } : {}),
    },
    orderBy: { blockCode: 'asc' },
  });
}

export async function createZone(
  prisma: PrismaClient,
  scope: Required<Pick<TenantScope, 'concessionId' | 'assemblyId'>>,
  input: {
    zoneCode: string;
    zoneName: string;
    boundaryCoordinates?: unknown;
    centroidLatitude?: number;
    centroidLongitude?: number;
  },
) {
  return prisma.spatialZone.create({
    data: {
      concessionId: scope.concessionId,
      assemblyId: scope.assemblyId,
      zoneCode: input.zoneCode,
      zoneName: input.zoneName,
      boundaryCoordinates: input.boundaryCoordinates === undefined
        ? undefined
        : input.boundaryCoordinates as Prisma.InputJsonValue,
      centroidLatitude: input.centroidLatitude,
      centroidLongitude: input.centroidLongitude,
    },
  });
}

export async function createBlock(
  prisma: PrismaClient,
  zoneId: string,
  scope: { concessionId: string; assemblyId?: string },
  input: {
    blockCode: string;
    boundaryCoordinates?: unknown;
    centroidLatitude?: number;
    centroidLongitude?: number;
  },
) {
  const zone = await prisma.spatialZone.findFirst({
    where: {
      id: zoneId,
      concessionId: scope.concessionId,
      ...(scope.assemblyId ? { assemblyId: scope.assemblyId } : {}),
    },
  });
  if (!zone) return null;
  return prisma.spatialBlock.create({
    data: {
      concessionId: scope.concessionId,
      assemblyId: zone.assemblyId,
      zoneId,
      blockCode: input.blockCode,
      boundaryCoordinates: input.boundaryCoordinates as Prisma.InputJsonValue,
      centroidLatitude: input.centroidLatitude,
      centroidLongitude: input.centroidLongitude,
    },
  });
}
