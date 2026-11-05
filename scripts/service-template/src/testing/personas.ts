// Generated from scripts/shared-service-files. Do not edit by hand.
// Run `node scripts/sync-role-model.mjs` after changing the shared copy.
import { capabilitiesForRoles, type ProjectRole } from '../lib/roles';

/**
 * Fixed tenancy for automated tests: two concessions, each with a concession org
 * and assembly orgs, and users with different roles in them. Use the orgs to
 * mock the org registry and the users with the test issuer (signed tokens) or
 * devHeaders (AUTH_MODE=disabled). These ids exist only in tests; for the local
 * stack see docs/LOCAL_DEVELOPMENT.md.
 */
export interface TestOrg {
  orgId: string;
  concessionId: string;
  assemblyId: string | null;
  scope: 'CONCESSION' | 'ASSEMBLY';
}

export interface TestUser {
  subject: string;
  /** The ZITADEL org the user's account lives in. Omit to test a token without one. */
  homeOrgId?: string;
  /** Role key to the orgs that grant it. */
  roles?: Partial<Record<ProjectRole, string[]>>;
}

export const TEST_CONCESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const TEST_CONCESSION_B = 'abababab-abab-4bab-8bab-abababababab';

export const TEST_ORGS = {
  concessionA: { orgId: '200000000000000100', concessionId: TEST_CONCESSION_A, assemblyId: null, scope: 'CONCESSION' },
  assemblyA1: { orgId: '200000000000000101', concessionId: TEST_CONCESSION_A, assemblyId: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', scope: 'ASSEMBLY' },
  assemblyA2: { orgId: '200000000000000102', concessionId: TEST_CONCESSION_A, assemblyId: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', scope: 'ASSEMBLY' },
  concessionB: { orgId: '200000000000000200', concessionId: TEST_CONCESSION_B, assemblyId: null, scope: 'CONCESSION' },
  assemblyB1: { orgId: '200000000000000201', concessionId: TEST_CONCESSION_B, assemblyId: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', scope: 'ASSEMBLY' },
} as const satisfies Record<string, TestOrg>;

/** An org id that is not in the registry. */
export const TEST_UNREGISTERED_ORG = '200000000000000999';

/** The registry answer for an org id, or null: use it to mock resolveOrgContext. */
export function testOrgContext(orgId: string): TestOrg | null {
  return Object.values(TEST_ORGS).find((org) => org.orgId === orgId) ?? null;
}

const { concessionA, assemblyA1, assemblyA2, assemblyB1 } = TEST_ORGS;

export const TEST_USERS = {
  concessionAdminA: {
    subject: 'user-concession-admin-a',
    homeOrgId: concessionA.orgId,
    roles: { CONCESSION_SUPER_ADMIN: [concessionA.orgId, assemblyA1.orgId, assemblyA2.orgId] },
  },
  assemblyAdminA1: { subject: 'user-assembly-admin-a1', homeOrgId: assemblyA1.orgId, roles: { ASSEMBLY_ADMIN: [assemblyA1.orgId] } },
  fieldAgentA1: { subject: 'user-field-agent-a1', homeOrgId: assemblyA1.orgId, roles: { FIELD_AGENT: [assemblyA1.orgId] } },
  viewerA2: { subject: 'user-viewer-a2', homeOrgId: assemblyA2.orgId, roles: { ASSEMBLY_VIEWER: [assemblyA2.orgId] } },
  assemblyAdminB1: { subject: 'user-assembly-admin-b1', homeOrgId: assemblyB1.orgId, roles: { ASSEMBLY_ADMIN: [assemblyB1.orgId] } },
  /** Signed in, registered org, but no iDARMS role. */
  noRoleA1: { subject: 'user-no-role-a1', homeOrgId: assemblyA1.orgId, roles: {} },
  /** A role granted only in another org: grants nothing in the home org. */
  foreignRoleA1: { subject: 'user-foreign-role-a1', homeOrgId: assemblyA1.orgId, roles: { ASSEMBLY_ADMIN: [assemblyA2.orgId] } },
  unregistered: { subject: 'user-unregistered', homeOrgId: TEST_UNREGISTERED_ORG, roles: { ASSEMBLY_ADMIN: [TEST_UNREGISTERED_ORG] } },
  noHomeOrg: { subject: 'user-no-home-org', roles: { ASSEMBLY_ADMIN: [assemblyA1.orgId] } },
} as const satisfies Record<string, TestUser>;

/**
 * x-idarms-* headers for a service running with AUTH_MODE=disabled (tests, or a
 * loopback-only local service). Header identity skips token verification, so it
 * exists only in those two places. Roles and permissions come from the user's
 * home org, as a verified token would give them.
 */
export function devHeaders(user: TestUser): Record<string, string> {
  const org = user.homeOrgId ? testOrgContext(user.homeOrgId) : null;
  const roles = Object.entries(user.roles ?? {})
    .filter(([, orgIds]) => user.homeOrgId !== undefined && (orgIds ?? []).includes(user.homeOrgId))
    .map(([role]) => role);
  const permissions = capabilitiesForRoles(roles);
  return {
    'x-idarms-actor-id': user.subject,
    'x-idarms-roles': roles.join(','),
    // An empty list would fall back to the service's default permissions; 'none' grants nothing.
    'x-idarms-permissions': permissions.length > 0 ? permissions.join(',') : 'none',
    ...(user.homeOrgId ? { 'x-idarms-org-id': user.homeOrgId, 'x-idarms-authorized-org-ids': user.homeOrgId } : {}),
    ...(org ? { 'x-idarms-concession-id': org.concessionId, 'x-idarms-scope-level': org.scope } : {}),
    ...(org?.assemblyId ? { 'x-idarms-assembly-id': org.assemblyId } : {}),
  };
}
