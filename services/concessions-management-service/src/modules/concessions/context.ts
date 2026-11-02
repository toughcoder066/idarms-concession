import type { AuthContext } from '../../types/global';

export interface TenantScope {
  concessionId: string;
  assemblyId?: string;
}

export function scopeFromAuth(auth: AuthContext): TenantScope | null {
  if (!auth.concessionId) return null;
  if (auth.scopeLevel === 'PORTFOLIO') return { concessionId: auth.concessionId };
  return { concessionId: auth.concessionId, assemblyId: auth.assemblyId };
}

export function canAccessAssembly(auth: AuthContext, assemblyId: string): boolean {
  if (auth.scopeLevel === 'PORTFOLIO') return true;
  return !auth.assemblyId || auth.assemblyId === assemblyId;
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
