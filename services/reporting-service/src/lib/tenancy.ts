import type { AuthContext } from '../types/global';

/**
 * What a read may see. An assembly-specific caller sees one assembly; only the
 * concession super admin sees every assembly of their concession (ADR-0002).
 * Every row still carries its assemblyId, so aggregated views stay labelled.
 */
export type ReadScope =
  | { concessionId: string; assemblyId: string }
  | { concessionId: string; allAssemblies: true };

/**
 * Only the concession super admin, signed in at concession level,
 * reads across assemblies. Scope level alone is not enough: the super admin
 * grant must be on the caller's home org. Dev-mode callers carry roles but no grants.
 */
export function isConcessionSuperAdmin(auth: AuthContext): boolean {
  if (auth.scopeLevel !== 'CONCESSION') return false;
  const grants = auth.roleGrants ?? [];
  if (grants.length > 0) {
    return grants.some((grant) => grant.role === 'CONCESSION_SUPER_ADMIN' && grant.orgId === auth.homeOrgId);
  }
  return auth.roles.includes('CONCESSION_SUPER_ADMIN');
}

export function readScopeFromAuth(auth: AuthContext): ReadScope | null {
  if (!auth.concessionId) return null;
  if (isConcessionSuperAdmin(auth)) return { concessionId: auth.concessionId, allAssemblies: true };
  if (!auth.assemblyId) return null;
  return { concessionId: auth.concessionId, assemblyId: auth.assemblyId };
}

/** Prisma filter for a read scope. The concession is always enforced. */
export function readScopeWhere(scope: ReadScope): { concessionId: string; assemblyId?: string } {
  return 'assemblyId' in scope
    ? { concessionId: scope.concessionId, assemblyId: scope.assemblyId }
    : { concessionId: scope.concessionId };
}
