import type { Assembly, ConcessionAssembly, PrismaClient } from '../../../generated/prisma';
import { allowedRolesToManage, canManageUserWithRoles } from '../../lib/roles';
import type { AuthContext } from '../../types/global';

export const STAFF_ROLE_KEYS = [
  'ASSEMBLY_ADMIN',
  'FIELD_OPS_MANAGER',
  'FINANCE_OFFICER',
  'SECRETARY',
  'CASHIER',
  'FIELD_AGENT',
  'ASSEMBLY_VIEWER',
] as const;

export type StaffActorRole = 'CONCESSION_SUPER_ADMIN' | 'ASSEMBLY_ADMIN';

export interface StaffAccessContext {
  assembly: Assembly & { concessions: ConcessionAssembly[] };
  orgId: string;
  concessionId: string;
  actorRole: StaffActorRole;
  orgRoles: string[];
  allowedRoles: string[];
}

export class StaffAccessError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly auditContext?: {
      assemblyId?: string;
      concessionId?: string;
      assemblyName?: string;
    },
  ) {
    super(message);
    this.name = 'StaffAccessError';
  }
}

export class StaffDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'StaffDomainError';
  }
}

/**
 * Resolves assembly scope from the database and the caller's org-specific grants.
 * A client-supplied assembly ID is never trusted on its own: the assembly's
 * ZITADEL org must be present in the caller's authorized org set.
 */
export async function resolveStaffAccess(
  prisma: PrismaClient,
  auth: AuthContext,
  assemblyId: string,
): Promise<StaffAccessContext> {
  const assembly = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    include: { concessions: true },
  });
  const scope = assembly
    ? {
      assemblyId: assembly.id,
      concessionId: assembly.concessions[0]?.concessionId,
      assemblyName: assembly.assemblyName,
    }
    : { assemblyId };
  // A caller without access must not be able to distinguish a missing assembly
  // from one that exists but is outside their grant set.
  const notAuthorized = 'No staff-management grant exists in this assembly organization.';
  if (!assembly) {
    throw new StaffAccessError(notAuthorized, 'org_forbidden', 403, scope);
  }
  if (!assembly.zitadelOrgId) {
    throw new StaffAccessError(notAuthorized, 'org_forbidden', 403, scope);
  }

  const concessionId = assembly.concessions[0]?.concessionId;
  if (!concessionId) {
    throw new StaffAccessError(notAuthorized, 'org_forbidden', 403, scope);
  }
  if (auth.concessionId && auth.concessionId !== concessionId) {
    throw new StaffAccessError(notAuthorized, 'org_forbidden', 403, scope);
  }

  const orgId = assembly.zitadelOrgId;
  const grantRoles = (auth.roleGrants ?? [])
    .filter((grant) => grant.orgId === orgId)
    .map((grant) => grant.role);
  const authorized = auth.authorizedOrgIds?.includes(orgId) ?? false;

  if (grantRoles.length === 0 && !authorized) {
    throw new StaffAccessError(notAuthorized, 'org_forbidden', 403, scope);
  }

  const orgRoles = grantRoles.length > 0
    ? [...new Set(grantRoles)]
    : [...new Set(auth.roles)];

  const actorRole: StaffActorRole | null = orgRoles.includes('CONCESSION_SUPER_ADMIN')
    ? 'CONCESSION_SUPER_ADMIN'
    : orgRoles.includes('ASSEMBLY_ADMIN') ? 'ASSEMBLY_ADMIN' : null;

  if (!actorRole) {
    throw new StaffAccessError(
      'Only an Assembly Admin or Concession Super Admin can manage staff in this organization.',
      'role_forbidden',
      403,
      scope,
    );
  }

  return {
    assembly,
    orgId,
    concessionId,
    actorRole,
    orgRoles,
    allowedRoles: allowedRolesToManage(actorRole),
  };
}

export function assertRoleAllowed(access: StaffAccessContext, role: string): void {
  if (!access.allowedRoles.includes(role)) {
    throw new StaffAccessError(
      `Role ${role} is outside the caller's allowed provisioning set.`,
      'role_forbidden',
      403,
      {
        assemblyId: access.assembly.id,
        concessionId: access.concessionId,
        assemblyName: access.assembly.assemblyName,
      },
    );
  }
}

export function assertCanManageTarget(
  access: StaffAccessContext,
  currentRoles: readonly string[],
): void {
  const scope = {
    assemblyId: access.assembly.id,
    concessionId: access.concessionId,
    assemblyName: access.assembly.assemblyName,
  };
  if (currentRoles.length === 0) {
    throw new StaffDomainError('User has no iDARMS role in this organization.', 'staff_not_found', 404);
  }
  if (!canManageUserWithRoles(access.actorRole, currentRoles)) {
    throw new StaffAccessError(
      'The target user holds a role above the caller\'s management ceiling.',
      'target_forbidden',
      403,
      scope,
    );
  }
}
