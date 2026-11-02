import { describe, expect, it } from 'vitest';
import {
  allowedRolesToManage,
  canManageRole,
  canManageUserWithRoles,
  capabilitiesForRoles,
  isHumanRole,
  parseRoleGrants,
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

  it('gives portfolio capabilities only to CONCESSION_SUPER_ADMIN', () => {
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('portfolio:reporting:read');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('portfolio:target:manage');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('portfolio:audit:read');
    expect(ROLE_CAPABILITIES.CONCESSION_SUPER_ADMIN).toContain('directory:manage');
    expect(ROLE_CAPABILITIES.ASSEMBLY_ADMIN).not.toContain('portfolio:reporting:read');
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

  it('parses both ZITADEL role claim shapes and keeps org IDs', () => {
    const grants = parseRoleGrants({
      'urn:zitadel:iam:org:project:roles': {
        CONCESSION_SUPER_ADMIN: {
          '395945616116613123': 'portfolio.localhost',
          '396250035848740867': 'assembly-a.localhost',
        },
      },
      'urn:zitadel:iam:org:project:395947172589207555:roles': {
        FIELD_AGENT: { '396250035848740867': 'assembly-a.localhost' },
      },
      'urn:zitadel:iam:org:project:roles:legacy': {
        'property:read': { '396250035848740867': 'assembly-a.localhost' },
      },
    });

    expect(grants).toEqual([
      {
        role: 'CONCESSION_SUPER_ADMIN',
        orgId: '395945616116613123',
        orgDomain: 'portfolio.localhost',
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
