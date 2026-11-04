/**
 * Canonical iDARMS role and capability model.
 *
 * ZITADEL project roles are the human-facing roles below. The capability
 * strings are application permissions bundled into those roles; they are not
 * separate ZITADEL roles.
 */

export const CAPABILITIES = [
  // Concession-wide
  'concession:read',
  'concession:manage',
  'concession:reporting:read',
  'concession:target:read',
  'concession:target:manage',
  'concession:audit:read',
  'directory:read',
  'directory:manage',

  // Assembly / org
  'assembly:read',
  'assembly:manage',
  'staff:read',
  'staff:manage',
  'fee_fixing:read',
  'fee_fixing:manage',
  'fee_fixing:publish',
  'approval:read',
  'approval:manage',
  'target:read',
  'target:manage',
  'audit:read',
  'agent:manage',
  'gis:read',
  'gis:manage',
  'reporting:read',

  // Operational
  'ratepayer:read',
  'ratepayer:create',
  'property:read',
  'property:create',
  'property:verify',
  'property:update',
  'document:read',
  'document:upload',
  'valuation:read',
  'valuation:calculate',
  'bill:read',
  'bill:generate',
  'payment:read',
  'payment:checkout',
  'reconciliation:read',
  'reconciliation:reconcile',

  // Machine
  'integration:sync',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const HUMAN_ROLE_KEYS = [
  'CONCESSION_SUPER_ADMIN',
  'ASSEMBLY_ADMIN',
  'FIELD_OPS_MANAGER',
  'FINANCE_OFFICER',
  'SECRETARY',
  'CASHIER',
  'FIELD_AGENT',
  'ASSEMBLY_VIEWER',
] as const;

export type HumanRole = (typeof HUMAN_ROLE_KEYS)[number];

export const MACHINE_ROLE_KEYS = ['CROIP_M2M'] as const;

export type MachineRole = (typeof MACHINE_ROLE_KEYS)[number];

export type ProjectRole = HumanRole | MachineRole;

export type RoleScope = 'concession' | 'org' | 'machine';

export interface RoleDefinition {
  key: ProjectRole;
  displayName: string;
  group: string;
  scope: RoleScope;
  type: 'human' | 'machine';
}

export const PLATFORM_ADMIN = 'PLATFORM_ADMIN';

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    key: 'CONCESSION_SUPER_ADMIN',
    displayName: 'Concession Super Admin',
    group: 'Concession',
    scope: 'concession',
    type: 'human',
  },
  {
    key: 'ASSEMBLY_ADMIN',
    displayName: 'Assembly Admin',
    group: 'Assembly',
    scope: 'org',
    type: 'human',
  },
  {
    key: 'FIELD_OPS_MANAGER',
    displayName: 'Field Operations Manager',
    group: 'Assembly',
    scope: 'org',
    type: 'human',
  },
  {
    key: 'FINANCE_OFFICER',
    displayName: 'Finance Officer',
    group: 'Assembly',
    scope: 'org',
    type: 'human',
  },
  {
    key: 'SECRETARY',
    displayName: 'Secretary',
    group: 'Assembly',
    scope: 'org',
    type: 'human',
  },
  {
    key: 'CASHIER',
    displayName: 'Cashier',
    group: 'Assembly',
    scope: 'org',
    type: 'human',
  },
  {
    key: 'FIELD_AGENT',
    displayName: 'Field Agent',
    group: 'Assembly',
    scope: 'org',
    type: 'human',
  },
  {
    key: 'ASSEMBLY_VIEWER',
    displayName: 'Assembly Viewer',
    group: 'Assembly',
    scope: 'org',
    type: 'human',
  },
  {
    key: 'CROIP_M2M',
    displayName: 'CROIP Machine Client',
    group: 'Service',
    scope: 'machine',
    type: 'machine',
  },
];

export const PROJECT_ROLE_KEYS: readonly ProjectRole[] = ROLE_DEFINITIONS.map((role) => role.key);

const ORG_READ: readonly Capability[] = [
  'assembly:read',
  'ratepayer:read',
  'property:read',
  'document:read',
  'valuation:read',
  'bill:read',
  'payment:read',
  'reconciliation:read',
  'gis:read',
];

export const ROLE_CAPABILITIES: Record<ProjectRole, readonly Capability[]> = {
  CONCESSION_SUPER_ADMIN: [
    ...ORG_READ,
    'concession:read',
    'concession:manage',
    'concession:reporting:read',
    'concession:target:read',
    'concession:target:manage',
    'concession:audit:read',
    'directory:read',
    'directory:manage',
    'assembly:manage',
    'staff:read',
    'staff:manage',
    // Oversight, not operations (ADR-0002): rates and agent assignment are view-only.
    'fee_fixing:read',
    'approval:read',
    'target:read',
    'target:manage',
    'audit:read',
    'reporting:read',
  ],
  ASSEMBLY_ADMIN: [
    ...ORG_READ,
    'assembly:manage',
    'staff:read',
    'staff:manage',
    'fee_fixing:read',
    'fee_fixing:manage',
    'fee_fixing:publish',
    'approval:read',
    'approval:manage',
    'target:read',
    'target:manage',
    'audit:read',
    'reporting:read',
    'agent:manage',
    'gis:manage',
    'document:upload',
    'ratepayer:create',
    'property:create',
  ],
  FIELD_OPS_MANAGER: [
    ...ORG_READ,
    'staff:read',
    'agent:manage',
    'property:verify',
    'property:update',
    'target:read',
    'reporting:read',
    'gis:manage',
  ],
  FINANCE_OFFICER: [
    ...ORG_READ,
    'fee_fixing:read',
    'fee_fixing:manage',
    'approval:read',
    'target:read',
    'reporting:read',
    'bill:generate',
    'payment:checkout',
    'reconciliation:reconcile',
    'valuation:calculate',
    'document:upload',
  ],
  SECRETARY: [
    ...ORG_READ,
    'ratepayer:create',
    'property:create',
    'property:update',
    'document:upload',
    'fee_fixing:read',
    'target:read',
    'reporting:read',
  ],
  CASHIER: [
    'assembly:read',
    'payment:read',
    'payment:checkout',
    'bill:read',
    'ratepayer:read',
  ],
  FIELD_AGENT: [
    'assembly:read',
    'property:read',
    'property:verify',
    'ratepayer:read',
    'document:read',
    'gis:read',
  ],
  ASSEMBLY_VIEWER: [
    ...ORG_READ,
    'staff:read',
    'fee_fixing:read',
    'approval:read',
    'target:read',
    'audit:read',
    'reporting:read',
  ],
  CROIP_M2M: ['integration:sync'],
};

const MANAGEABLE_ROLES: Record<string, readonly ProjectRole[]> = {
  [PLATFORM_ADMIN]: PROJECT_ROLE_KEYS,
  CONCESSION_SUPER_ADMIN: [
    'ASSEMBLY_ADMIN',
    'FIELD_OPS_MANAGER',
    'FINANCE_OFFICER',
    'SECRETARY',
    'CASHIER',
    'FIELD_AGENT',
    'ASSEMBLY_VIEWER',
  ],
  ASSEMBLY_ADMIN: [
    'FIELD_OPS_MANAGER',
    'FINANCE_OFFICER',
    'SECRETARY',
    'CASHIER',
    'FIELD_AGENT',
    'ASSEMBLY_VIEWER',
  ],
  FIELD_OPS_MANAGER: ['FIELD_AGENT'],
  FINANCE_OFFICER: [],
  SECRETARY: [],
  CASHIER: [],
  FIELD_AGENT: [],
  ASSEMBLY_VIEWER: [],
  CROIP_M2M: [],
};

export function isHumanRole(role: string): role is HumanRole {
  return (HUMAN_ROLE_KEYS as readonly string[]).includes(role);
}

export function isProjectRole(role: string): role is ProjectRole {
  return (PROJECT_ROLE_KEYS as readonly string[]).includes(role);
}

export function getRoleDefinition(role: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((definition) => definition.key === role);
}

export interface RoleGrant {
  role: ProjectRole;
  orgId: string;
  orgDomain?: string;
}

/**
 * Parses both ZITADEL role claim shapes:
 *   urn:zitadel:iam:org:project:roles
 *   urn:zitadel:iam:org:project:{projectId}:roles
 * into a flat role/org grant list. The project-specific claim counts only for
 * the iDARMS project, so roles from any other ZITADEL project are ignored.
 * Unknown (legacy) role keys are ignored.
 */
export function parseRoleGrants(claims: Record<string, unknown>, projectId?: string): RoleGrant[] {
  const grants: RoleGrant[] = [];
  const seen = new Set<string>();
  const projectClaim = projectId ? `urn:zitadel:iam:org:project:${projectId}:roles` : undefined;

  for (const [key, value] of Object.entries(claims)) {
    const isRoleClaim = key === 'urn:zitadel:iam:org:project:roles' || key === projectClaim;
    if (!isRoleClaim || !value || typeof value !== 'object') continue;

    for (const [role, orgs] of Object.entries(value as Record<string, unknown>)) {
      if (!isProjectRole(role) || !orgs || typeof orgs !== 'object') continue;
      for (const [orgId, orgDomain] of Object.entries(orgs as Record<string, unknown>)) {
        const dedupeKey = `${role}:${orgId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        grants.push({
          role,
          orgId,
          orgDomain: typeof orgDomain === 'string' ? orgDomain : undefined,
        });
      }
    }
  }

  return grants;
}

/**
 * Roles granted in one organization. Permissions follow the organization the
 * tenant was resolved from, so a role held in another organization never
 * applies here.
 */
export function rolesInOrg(grants: readonly RoleGrant[], orgId: string | undefined): ProjectRole[] {
  if (!orgId) return [];
  return [...new Set(grants.filter((grant) => grant.orgId === orgId).map((grant) => grant.role))];
}

export function capabilitiesForRoles(roles: readonly string[]): Capability[] {
  const capabilities = new Set<Capability>();
  for (const role of roles) {
    for (const capability of ROLE_CAPABILITIES[role as ProjectRole] ?? []) {
      capabilities.add(capability);
    }
  }
  return [...capabilities];
}

export function allowedRolesToManage(actorRole: string): ProjectRole[] {
  return [...(MANAGEABLE_ROLES[actorRole] ?? [])];
}

export function canManageRole(actorRole: string, targetRole: string): boolean {
  return (allowedRolesToManage(actorRole) as readonly string[]).includes(targetRole);
}

/**
 * True only when every role held by the target user is within the actor's
 * provisioning ceiling. This prevents an actor from editing/suspending a user
 * who holds a role above that ceiling.
 */
export function canManageUserWithRoles(actorRole: string, targetRoles: readonly string[]): boolean {
  const allowed = new Set<string>(allowedRolesToManage(actorRole));
  return targetRoles.length > 0 && targetRoles.every((role) => allowed.has(role));
}
