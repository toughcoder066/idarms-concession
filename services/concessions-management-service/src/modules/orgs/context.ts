import type { PrismaClient } from '../../../generated/prisma';

/**
 * The two iDARMS organisational scopes. The concession org holds
 * concession-wide users; each assembly org holds one assembly's staff. ZITADEL's
 * own default (infrastructure) org is never a tenant and is never registered.
 */
export const ORG_SCOPES = ['CONCESSION', 'ASSEMBLY'] as const;
export type OrgScope = (typeof ORG_SCOPES)[number];

export interface OrgContext {
  orgId: string;
  concessionId: string;
  assemblyId: string | null;
  scope: OrgScope;
}

/**
 * Resolve a ZITADEL organization to the iDARMS tenant context, from the org
 * registry only (ADR-0003). An org that is not registered, not ACTIVE, or whose
 * row is inconsistent (a CONCESSION row with an assembly, an ASSEMBLY row
 * without one) resolves to nothing: the caller gets no tenant, never a guess.
 */
export async function resolveOrgContext(
  prisma: PrismaClient,
  orgId: string,
): Promise<OrgContext | null> {
  const registered = await prisma.zitadelOrgContext.findUnique({ where: { orgId } });
  if (!registered || registered.status !== 'ACTIVE') return null;

  const scope = registered.scope;
  if (scope === 'CONCESSION' && registered.assemblyId === null) {
    return { orgId, concessionId: registered.concessionId, assemblyId: null, scope };
  }
  if (scope === 'ASSEMBLY' && registered.assemblyId) {
    return { orgId, concessionId: registered.concessionId, assemblyId: registered.assemblyId, scope };
  }
  return null;
}

/** The ACTIVE concession org of a concession, or null when none is registered. */
export async function concessionOrgId(prisma: PrismaClient, concessionId: string): Promise<string | null> {
  const row = await prisma.zitadelOrgContext.findFirst({
    where: { concessionId, scope: 'CONCESSION', assemblyId: null, status: 'ACTIVE' },
    select: { orgId: true },
  });
  return row?.orgId ?? null;
}
