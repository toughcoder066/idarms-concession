import { describe, expect, it } from 'vitest';
import { canAccessAssembly, canPublishRates, scopeFromAuth } from './context';
import type { AuthContext } from '../../types/global';

function auth(overrides: Partial<AuthContext>): AuthContext {
  return {
    subject: 'user-1',
    roles: [],
    permissions: [],
    concessionId: '11111111-1111-1111-1111-111111111111',
    ...overrides,
  };
}

describe('concession approval policy', () => {
  it('prevents a super admin from publishing MMDA rates', () => {
    expect(canPublishRates(auth({
      roles: ['CONCESSION_SUPER_ADMIN'],
      permissions: ['fee_fixing:publish'],
    }))).toBe(false);
  });

  it('allows only the assembly administrator to publish', () => {
    expect(canPublishRates(auth({ roles: ['ASSEMBLY_ADMIN'] }))).toBe(true);
    expect(canPublishRates(auth({ roles: ['FINANCE_OFFICER'] }))).toBe(false);
    expect(canPublishRates(auth({ roles: ['ASSEMBLY_ADMIN', 'FINANCE_OFFICER'] }))).toBe(true);
  });

  it('does not allow a permission-only caller to publish', () => {
    expect(canPublishRates(auth({ permissions: ['fee_fixing:publish'] }))).toBe(false);
  });
});

describe('tenant scope', () => {
  it('drops the assembly filter for the concession super admin at concession scope (ADR-0002)', () => {
    expect(scopeFromAuth(auth({
      roles: ['CONCESSION_SUPER_ADMIN'],
      roleGrants: [{ role: 'CONCESSION_SUPER_ADMIN', orgId: 'concession-org' }],
      homeOrgId: 'concession-org',
      scopeLevel: 'CONCESSION',
    }))).toEqual({ concessionId: '11111111-1111-1111-1111-111111111111' });
  });

  it('does not widen concession scope for any role other than the super admin', () => {
    expect(scopeFromAuth(auth({
      roles: ['ASSEMBLY_ADMIN'],
      roleGrants: [{ role: 'ASSEMBLY_ADMIN', orgId: 'concession-org' }],
      homeOrgId: 'concession-org',
      scopeLevel: 'CONCESSION',
    }))).toBeNull();
  });

  it('does not widen concession scope when the super admin grant is on another org', () => {
    expect(scopeFromAuth(auth({
      roles: ['CONCESSION_SUPER_ADMIN'],
      roleGrants: [{ role: 'CONCESSION_SUPER_ADMIN', orgId: 'assembly-org' }],
      homeOrgId: 'concession-org',
      scopeLevel: 'CONCESSION',
    }))).toBeNull();
  });

  it('refuses an assembly-scope caller with no assembly instead of widening to the concession', () => {
    expect(scopeFromAuth(auth({ roles: ['ASSEMBLY_ADMIN'], scopeLevel: 'ASSEMBLY' }))).toBeNull();
  });

  it('limits assembly access checks to the caller assembly unless super admin', () => {
    const assemblyAdmin = auth({
      roles: ['ASSEMBLY_ADMIN'],
      assemblyId: '22222222-2222-2222-2222-222222222222',
      scopeLevel: 'ASSEMBLY',
    });
    expect(canAccessAssembly(assemblyAdmin, '22222222-2222-2222-2222-222222222222')).toBe(true);
    expect(canAccessAssembly(assemblyAdmin, '33333333-3333-3333-3333-333333333333')).toBe(false);
    expect(canAccessAssembly(auth({ roles: ['ASSEMBLY_ADMIN'] }), '33333333-3333-3333-3333-333333333333')).toBe(false);
  });

  it('keeps the assembly filter for assembly scope', () => {
    expect(scopeFromAuth(auth({
      assemblyId: '22222222-2222-2222-2222-222222222222',
      scopeLevel: 'ASSEMBLY',
    }))).toEqual({
      concessionId: '11111111-1111-1111-1111-111111111111',
      assemblyId: '22222222-2222-2222-2222-222222222222',
    });
  });
});
