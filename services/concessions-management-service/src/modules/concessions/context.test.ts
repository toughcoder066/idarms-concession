import { describe, expect, it } from 'vitest';
import { canPublishRates, scopeFromAuth } from './context';
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
  it('drops the assembly filter for portfolio scope', () => {
    expect(scopeFromAuth(auth({
      assemblyId: '22222222-2222-2222-2222-222222222222',
      scopeLevel: 'PORTFOLIO',
    }))).toEqual({ concessionId: '11111111-1111-1111-1111-111111111111' });
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
