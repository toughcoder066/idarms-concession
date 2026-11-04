import type { Session } from 'next-auth';
import { describe, expect, it, vi } from 'vitest';
import { authorizeAssemblyAction } from './authorize';

vi.mock('@/auth', () => ({ auth: async () => null }));

function session(overrides: Partial<Session> = {}): Session {
  return {
    user: { name: 'Ama' },
    expires: '2099-01-01T00:00:00.000Z',
    userId: 'user-1',
    roles: ['SECRETARY'],
    permissions: [],
    assemblyIds: ['asm-1'],
    concessionId: 'conc-1',
    assemblyId: 'asm-1',
    scopeLevel: 'ASSEMBLY',
    ...overrides,
  };
}

describe('assembly actions need the capability and a resolved assembly', () => {
  it('allows a secretary to register in their assembly', () => {
    const result = authorizeAssemblyAction(session(), 'ratepayer:create');
    expect(result).toMatchObject({ ok: true, access: { assemblyId: 'asm-1', concessionId: 'conc-1' } });
  });

  it('allows an assembly admin to register ratepayers and properties', () => {
    expect(authorizeAssemblyAction(session({ roles: ['ASSEMBLY_ADMIN'] }), 'ratepayer:create').ok).toBe(true);
    expect(authorizeAssemblyAction(session({ roles: ['ASSEMBLY_ADMIN'] }), 'property:create').ok).toBe(true);
  });

  it('refuses a role without the capability', () => {
    expect(authorizeAssemblyAction(session({ roles: ['FIELD_AGENT'] }), 'ratepayer:create')).toMatchObject({ ok: false, status: 403 });
    expect(authorizeAssemblyAction(session({ roles: ['ASSEMBLY_VIEWER'] }), 'property:create')).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses the super admin at concession level (reads only, ADR-0002)', () => {
    const superAdmin = session({ roles: ['CONCESSION_SUPER_ADMIN', 'SECRETARY'], scopeLevel: 'CONCESSION', assemblyId: undefined });
    expect(authorizeAssemblyAction(superAdmin, 'ratepayer:create')).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses when the tenant is not resolved', () => {
    expect(authorizeAssemblyAction(session({ assemblyId: undefined }), 'ratepayer:create')).toMatchObject({ ok: false, status: 403 });
    expect(authorizeAssemblyAction(session({ concessionId: undefined }), 'ratepayer:create')).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses no session and an ended session', () => {
    expect(authorizeAssemblyAction(null, 'ratepayer:create')).toMatchObject({ ok: false, status: 401 });
    expect(authorizeAssemblyAction(session({ error: 'NoRoles' }), 'ratepayer:create')).toMatchObject({ ok: false, status: 401 });
  });
});
