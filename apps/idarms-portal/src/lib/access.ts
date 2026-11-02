import {
  CAPABILITIES,
  capabilitiesForRoles,
  getRoleDefinition,
  isHumanRole,
  type HumanRole,
} from '@idarms/contracts';
import { auth } from '@/auth';
import { appConfig } from './config';

const DEV_PERMISSIONS = [...CAPABILITIES];

export interface ConcessionAccess {
  userId?: string;
  roles: string[];
  permissions: string[];
  role: HumanRole | null;
  roleLabel: string;
  scopeLevel: string;
  portfolio: boolean;
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

export async function getConcessionAccess(): Promise<ConcessionAccess> {
  const session = await auth();
  const allowDevContext = process.env.NODE_ENV !== 'production';
  const envRoles = allowDevContext ? appConfig.devRoles.split(',').map((role) => role.trim()).filter(Boolean) : [];
  const roles = session?.roles?.length ? session.roles : envRoles;
  const role = roles.find(isHumanRole) ?? null;

  const permissionSet = new Set<string>(capabilitiesForRoles(roles));
  for (const permission of session?.permissions ?? []) permissionSet.add(permission);
  if (permissionSet.size === 0 && allowDevContext) {
    for (const permission of DEV_PERMISSIONS) permissionSet.add(permission);
  }
  const permissions = [...permissionSet];

  const assemblyId = session?.assemblyId ?? (allowDevContext ? (appConfig.devAssemblyId || undefined) : undefined);
  const scopeLevel = session?.scopeLevel
    ?? (allowDevContext ? process.env.IDARMS_SCOPE_LEVEL ?? (assemblyId ? 'ASSEMBLY' : 'PORTFOLIO') : 'ASSEMBLY');
  const portfolio = scopeLevel === 'PORTFOLIO';
  const canManage = permissions.includes('portfolio:manage') || permissions.includes('assembly:manage');
  const canViewConcessions = permissions.some((permission) => (
    permission === 'portfolio:read'
    || permission.startsWith('fee_fixing:')
    || permission.startsWith('approval:')
    || permission === 'audit:read'
    || permission === 'agent:manage'
  ));
  const canPublishRates = permissions.includes('fee_fixing:publish');

  return {
    userId: session?.userId,
    roles,
    permissions,
    role,
    roleLabel: role
      ? (getRoleDefinition(role)?.displayName ?? role)
      : canManage ? 'Concession Administrator' : 'Read-only access',
    scopeLevel,
    portfolio,
    assemblyId,
    concessionId: session?.concessionId ?? (allowDevContext ? appConfig.devConcessionId : undefined),
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
