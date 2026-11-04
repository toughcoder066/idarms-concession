import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../types/global';
import { isConcessionSuperAdmin, readScopeFromAuth, readScopeWhere } from './tenancy';

const CONCESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSEMBLY_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function auth(overrides: Partial<AuthContext>): AuthContext {
  return { subject: 'user-1', roles: [], permissions: [], concessionId: CONCESSION_A, ...overrides };
}

describe('read scope (ADR-0002)', () => {
  it('treats a verified super admin grant on the home concession org as concession-wide', () => {
    const superAdmin = auth({
      roles: ['CONCESSION_SUPER_ADMIN'],
      roleGrants: [{ role: 'CONCESSION_SUPER_ADMIN', orgId: 'concession-org' }],
      homeOrgId: 'concession-org',
      scopeLevel: 'CONCESSION',
    });

    expect(isConcessionSuperAdmin(superAdmin)).toBe(true);
    expect(readScopeWhere(readScopeFromAuth(superAdmin)!)).toEqual({ concessionId: CONCESSION_A });
  });

  it('does not treat a super admin grant on another org as concession-wide', () => {
    expect(isConcessionSuperAdmin(auth({
      roles: ['CONCESSION_SUPER_ADMIN'],
      roleGrants: [{ role: 'CONCESSION_SUPER_ADMIN', orgId: 'assembly-org' }],
      homeOrgId: 'concession-org',
      scopeLevel: 'CONCESSION',
    }))).toBe(false);
  });

  it('never widens without a concession', () => {
    expect(readScopeFromAuth(auth({
      concessionId: undefined,
      roles: ['CONCESSION_SUPER_ADMIN'],
      scopeLevel: 'CONCESSION',
    }))).toBeNull();
  });

  it('keeps assembly staff on their own assembly', () => {
    const scope = readScopeFromAuth(auth({ roles: ['FIELD_AGENT'], assemblyId: ASSEMBLY_A, scopeLevel: 'ASSEMBLY' }));
    expect(readScopeWhere(scope!)).toEqual({ concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A });
  });

  it('refuses assembly staff with no assembly', () => {
    expect(readScopeFromAuth(auth({ roles: ['FIELD_AGENT'], scopeLevel: 'ASSEMBLY' }))).toBeNull();
  });
});
