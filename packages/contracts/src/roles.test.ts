import { describe, expect, it } from 'vitest';
import {
  allowedRolesToManage,
  canManageRole,
  canManageUserWithRoles,
  capabilitiesForRoles,
  isHumanRole,
  parseRoleGrants,
  rolesInOrg,
  ROLE_CAPABILITIES,
  ROLE_DEFINITIONS,
  type ProjectRole,
} from './roles';

const keys = ROLE_DEFINITIONS.map((role) => role.key);

describe('iDARMS role model', () => {
  it('defines exactly the 8 human roles plus the machine role', () => {
    expect(keys).toEqual([
      'CONCESSION_SUPER_ADMIN',
      'ASSEMBLY_ADMIN',
      'FIELD_OPS_MANAGER',
      'FINANCE_OFFICER',
      'SECRETARY',
      'CASHIER',
      'FIELD_AGENT',
      'ASSEMBLY_VIEWER',
      'CROIP_M2M',
    ]);
    expect(keys.filter(isHumanRole)).toHaveLength(8);
  });

  it('gives concession-wide capabilities only to CONCESSION_SUPER_ADMIN', () => {
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('concession:reporting:read');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('concession:target:manage');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('concession:audit:read');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('directory:manage');
    expect(ROLE_CAPABILITIES.ASSEMBLY_ADMIN).not.toContain('concession:reporting:read');
  });

  it('keeps publish/approve on ASSEMBLY_ADMIN only', () => {
    expect(ROLE_CAPABILITIES.ASSEMBLY_ADMIN).toContain('fee_fixing:publish');
    expect(ROLE_CAPABILITIES.ASSEMBLY_ADMIN).toContain('approval:manage');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).not.toContain('fee_fixing:publish');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).not.toContain('approval:manage');
  });

  it('gives CONCESSION_SUPER_ADMIN oversight and administration but no assembly operations (ADR-0002)', () => {
    const superAdmin = ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN;
    expect(superAdmin).toEqual(expect.arrayContaining(['assembly:manage', 'staff:manage', 'target:manage']));
    expect(superAdmin).toEqual(expect.arrayContaining(['fee_fixing:read', 'ratepayer:read', 'payment:read']));
    for (const operation of [
      'fee_fixing:manage',
      'agent:manage',
      'property:verify',
      'payment:checkout',
      'gis:manage',
      'document:upload',
    ]) {
      expect(superAdmin).not.toContain(operation);
    }
  });

  it('maps roles to their capabilities', () => {
    expect(capabilitiesForRoles(['FIELD_AGENT'])).toEqual(
      expect.arrayContaining(['property:read', 'property:verify', 'gis:read']),
    );
    expect(ROLE_CAPABILITIES.CROIP_M2M).toEqual(['integration:sync']);
  });

  it('enforces the provisioning ceiling', () => {
    expect(allowedRolesToManage('PLATFORM_ADMIN')).toEqual(keys);
    expect(allowedRolesToManage('CONCESSION_SUPER_ADMIN')).toEqual([
      'ASSEMBLY_ADMIN',
      'FIELD_OPS_MANAGER',
      'FINANCE_OFFICER',
      'SECRETARY',
      'CASHIER',
      'FIELD_AGENT',
      'ASSEMBLY_VIEWER',
    ]);
    expect(allowedRolesToManage('ASSEMBLY_ADMIN')).toEqual([
      'FIELD_OPS_MANAGER',
      'FINANCE_OFFICER',
      'SECRETARY',
      'CASHIER',
      'FIELD_AGENT',
      'ASSEMBLY_VIEWER',
    ]);
    expect(allowedRolesToManage('FIELD_OPS_MANAGER')).toEqual(['FIELD_AGENT']);
    for (const role of ['FINANCE_OFFICER', 'SECRETARY', 'CASHIER', 'FIELD_AGENT', 'ASSEMBLY_VIEWER', 'CROIP_M2M']) {
      expect(allowedRolesToManage(role)).toEqual([]);
    }
  });

  it('blocks escalation and cross-ceiling edits', () => {
    expect(canManageRole('ASSEMBLY_ADMIN', 'ASSEMBLY_ADMIN')).toBe(false);
    expect(canManageRole('ASSEMBLY_ADMIN', 'CONCESSION_SUPER_ADMIN')).toBe(false);
    expect(canManageRole('FIELD_OPS_MANAGER', 'FIELD_AGENT')).toBe(true);
    expect(canManageRole('FIELD_OPS_MANAGER', 'FINANCE_OFFICER')).toBe(false);
    expect(canManageUserWithRoles('FIELD_OPS_MANAGER', ['FIELD_AGENT'])).toBe(true);
    expect(canManageUserWithRoles('FIELD_OPS_MANAGER', ['FIELD_AGENT', 'FINANCE_OFFICER'])).toBe(false);
    expect(canManageUserWithRoles('FINANCE_OFFICER', ['FIELD_AGENT'])).toBe(false);
  });

  it('does not allow CONCESSION_SUPER_ADMIN to be created through the hierarchy helper', () => {
    const targets: ProjectRole[] = allowedRolesToManage('CONCESSION_SUPER_ADMIN');
    expect(targets).not.toContain('CONCESSION_SUPER_ADMIN');
  });

  it('parses the generic and the iDARMS project role claims and keeps org IDs', () => {
    const grants = parseRoleGrants({
      'urn:zitadel:iam:org:project:roles': {
        CONCESSION_SUPER_ADMIN: {
          '395945616116613123': 'concession.localhost',
          '396250035848740867': 'assembly-a.localhost',
        },
      },
      'urn:zitadel:iam:org:project:395947172589207555:roles': {
        FIELD_AGENT: { '396250035848740867': 'assembly-a.localhost' },
      },
      'urn:zitadel:iam:org:project:roles:legacy': {
        'property:read': { '396250035848740867': 'assembly-a.localhost' },
      },
    }, '395947172589207555');

    expect(grants).toEqual([
      {
        role: 'CONCESSION_SUPER_ADMIN',
        orgId: '395945616116613123',
        orgDomain: 'concession.localhost',
      },
      {
        role: 'CONCESSION_SUPER_ADMIN',
        orgId: '396250035848740867',
        orgDomain: 'assembly-a.localhost',
      },
      {
        role: 'FIELD_AGENT',
        orgId: '396250035848740867',
        orgDomain: 'assembly-a.localhost',
      },
    ]);
  });
});

describe('role claims are pinned to the iDARMS project', () => {
  const OUR_PROJECT = '395947172589207555';
  const ORG_A = '396250035848740867';

  it('ignores a role claim from another ZITADEL project', () => {
    const grants = parseRoleGrants({
      'urn:zitadel:iam:org:project:999999999999999999:roles': {
        ASSEMBLY_ADMIN: { [ORG_A]: 'assembly-a.localhost' },
      },
    }, OUR_PROJECT);

    expect(grants).toEqual([]);
  });

  it('accepts only the generic claim when no project id is given', () => {
    const grants = parseRoleGrants({
      'urn:zitadel:iam:org:project:roles': { FIELD_AGENT: { [ORG_A]: 'assembly-a.localhost' } },
      [`urn:zitadel:iam:org:project:${OUR_PROJECT}:roles`]: {
        ASSEMBLY_ADMIN: { [ORG_A]: 'assembly-a.localhost' },
      },
    });

    expect(grants.map((grant) => grant.role)).toEqual(['FIELD_AGENT']);
  });

  it('ignores look-alike claim keys', () => {
    const grants = parseRoleGrants({
      [`urn:zitadel:iam:org:project:${OUR_PROJECT}:roles:extra`]: {
        ASSEMBLY_ADMIN: { [ORG_A]: 'assembly-a.localhost' },
      },
      [`urn:zitadel:iam:org:project:x:${OUR_PROJECT}:roles`]: {
        ASSEMBLY_ADMIN: { [ORG_A]: 'assembly-a.localhost' },
      },
    }, OUR_PROJECT);

    expect(grants).toEqual([]);
  });
});

describe('rolesInOrg', () => {
  const grants = [
    { role: 'FIELD_AGENT' as const, orgId: 'org-a' },
    { role: 'ASSEMBLY_ADMIN' as const, orgId: 'org-b' },
    { role: 'ASSEMBLY_VIEWER' as const, orgId: 'org-a' },
  ];

  it('returns only the roles granted in that organization', () => {
    expect(rolesInOrg(grants, 'org-a')).toEqual(['FIELD_AGENT', 'ASSEMBLY_VIEWER']);
    expect(rolesInOrg(grants, 'org-b')).toEqual(['ASSEMBLY_ADMIN']);
  });

  it('returns nothing for an unknown or missing organization', () => {
    expect(rolesInOrg(grants, 'org-c')).toEqual([]);
    expect(rolesInOrg(grants, undefined)).toEqual([]);
  });
});
