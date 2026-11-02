import type { AuthContext } from '../../types/global';

export interface TenantScope {
  concessionId: string;
  assemblyId?: string;
}

/**
 * Only the concession super admin, signed in at concession (portfolio) level,
 * works across every assembly of the concession (ADR-0002). Scope level alone
 * is not enough: the super admin grant must be on the caller's home org.
 * Dev-mode callers carry roles but no grants.
 */
export function isConcessionSuperAdmin(auth: AuthContext): boolean {
  if (auth.scopeLevel !== 'PORTFOLIO') return false;
  const grants = auth.roleGrants ?? [];
  if (grants.length > 0) {
    return grants.some((grant) => grant.role === 'CONCESSION_SUPER_ADMIN' && grant.orgId === auth.homeOrgId);
  }
  return auth.roles.includes('CONCESSION_SUPER_ADMIN');
}

export function scopeFromAuth(auth: AuthContext): TenantScope | null {
  if (!auth.concessionId) return null;
  if (isConcessionSuperAdmin(auth)) return { concessionId: auth.concessionId };
  if (!auth.assemblyId) return null;
  return { concessionId: auth.concessionId, assemblyId: auth.assemblyId };
}

export function canAccessAssembly(auth: AuthContext, assemblyId: string): boolean {
  if (isConcessionSuperAdmin(auth)) return true;
  return auth.assemblyId === assemblyId;
}

export function isSuperAdmin(auth: AuthContext): boolean {
  return auth.roles.includes('CONCESSION_SUPER_ADMIN');
}

/** Only the Assembly Admin may approve/publish; dual control still applies. */
export function canPublishRates(auth: AuthContext): boolean {
  return auth.roles.includes('ASSEMBLY_ADMIN');
}

export function requestedByLabel(auth: AuthContext): string | undefined {
  return auth.roles.length > 0 ? auth.roles.join(', ') : undefined;
}
