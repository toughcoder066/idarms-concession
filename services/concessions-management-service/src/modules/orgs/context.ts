import type { PrismaClient } from '../../../generated/prisma';

export interface OrgContext {
  orgId: string;
  concessionId: string;
  assemblyId: string | null;
  scope: 'PORTFOLIO' | 'ASSEMBLY';
}

/**
 * Resolve a ZITADEL organization to the iDARMS tenant context. The portfolio
 * org maps to a concession contract; an assembly org maps to an assembly.
 */
export async function resolveOrgContext(
  prisma: PrismaClient,
  orgId: string,
): Promise<OrgContext | null> {
  const registered = await prisma.zitadelOrgContext.findUnique({ where: { orgId } });
  if (registered) {
    return {
      orgId,
      concessionId: registered.concessionId,
      assemblyId: registered.assemblyId,
      scope: registered.scope === 'PORTFOLIO' ? 'PORTFOLIO' : 'ASSEMBLY',
    };
  }

  const assembly = await prisma.assembly.findUnique({
    where: { zitadelOrgId: orgId },
    include: { concessions: true },
  });
  if (assembly) {
    const concessionId = assembly.concessions[0]?.concessionId;
    if (concessionId) {
      return {
        orgId,
        concessionId,
        assemblyId: assembly.id,
        scope: 'ASSEMBLY',
      };
    }
  }

  const contract = await prisma.concessionContract.findUnique({
    where: { zitadelOrgId: orgId },
  });
  if (contract) {
    return {
      orgId,
      concessionId: contract.id,
      assemblyId: null,
      scope: 'PORTFOLIO',
    };
  }

  return null;
}
