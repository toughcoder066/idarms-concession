import {
  capabilitiesForRoles,
  getRoleDefinition,
  isHumanRole,
  type HumanRole,
} from '@idarms/contracts';
import type { Session } from 'next-auth';
import { auth } from '@/auth';

export interface ConcessionAccess {
  userId?: string;
  roles: string[];
  permissions: string[];
  role: HumanRole | null;
  roleLabel: string;
  scopeLevel: string;
  /** Concession-wide: the super admin signed in from the CONCESSION-scoped org. */

  concessionWide: boolean;
  assemblyId?: string;
  concessionId?: string;
  canAccessStaff: boolean;
  canAccessDirectory: boolean;
  canManage: boolean;
  canViewConcessions: boolean;
  canEditRates: boolean;
  canManageAgents: boolean;
  canManageTargets: boolean;
  canPublishRates: boolean;
  readOnly: boolean;
}

/**
 * What the signed-in user may see and do in the portal, from the verified
 * session only, with the same rules as the services: permissions come from the
 * user's roles in their home organisation, and the tenant and scope level come
 * from the org registry. Nothing is filled in from configuration, so a missing
 * tenant shows as no access rather than a guessed one.
 */
export function accessFromSession(session: Session | null): ConcessionAccess {
  const roles = session && !session.error ? session.roles ?? [] : [];
  const role = roles.find(isHumanRole) ?? null;
  const permissions = [...capabilitiesForRoles(roles)];
  const assemblyId = roles.length > 0 ? session?.assemblyId : undefined;
  const concessionId = roles.length > 0 ? session?.concessionId : undefined;
  const scopeLevel = (roles.length > 0 ? session?.scopeLevel : undefined) ?? 'ASSEMBLY';
  // Concession-wide only for the super admin signed in at concession level (ADR-0002).
  const concessionWide = scopeLevel === 'CONCESSION' && roles.includes('CONCESSION_SUPER_ADMIN');
  const canManage = permissions.includes('concession:manage') || permissions.includes('assembly:manage');
  const canViewConcessions = permissions.some((permission) => (
    permission === 'concession:read'
    || permission.startsWith('fee_fixing:')
    || permission.startsWith('approval:')
    || permission === 'audit:read'
    || permission === 'agent:manage'
  ));
  const canPublishRates = permissions.includes('fee_fixing:publish');

  return {
    userId: session?.userId || undefined,
    roles,
    permissions,
    role,
    roleLabel: role
      ? (getRoleDefinition(role)?.displayName ?? role)
      : canManage ? 'Concession Administrator' : 'Read-only access',
    scopeLevel,
    concessionWide,
    assemblyId,
    concessionId,
    canAccessStaff: roles.includes('ASSEMBLY_ADMIN'),
    canAccessDirectory: roles.includes('CONCESSION_SUPER_ADMIN'),
    canManage,
    canViewConcessions,
    canEditRates: permissions.includes('fee_fixing:manage'),
    canManageAgents: permissions.includes('agent:manage'),
    canManageTargets: permissions.includes('target:manage'),
    canPublishRates,
    readOnly: role === 'ASSEMBLY_VIEWER' || (!canManage && !canPublishRates),
  };
}

export async function getConcessionAccess(): Promise<ConcessionAccess> {
  return accessFromSession(await auth());
}
