import type { Session } from 'next-auth';
import { describe, expect, it, vi } from 'vitest';
import { accessFromSession } from './access';

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

describe('portal access matches the services', () => {
  it('derives permissions from roles only, never from a session list', () => {
    const access = accessFromSession(session({ permissions: ['concession:manage'] }));
    expect(access.permissions).toContain('ratepayer:create');
    expect(access.permissions).not.toContain('concession:manage');
  });

  it('gives nothing to a user with no roles, not every capability', () => {
    const access = accessFromSession(session({ roles: [] }));
    expect(access.permissions).toEqual([]);
    expect(access.assemblyId).toBeUndefined();
    expect(access.concessionId).toBeUndefined();
    expect(access.readOnly).toBe(true);
  });

  it('gives nothing to an ended session', () => {
    expect(accessFromSession(session({ error: 'RefreshFailed' })).permissions).toEqual([]);
  });

  it('gives nothing without a session and fills in no dev tenant', () => {
    const access = accessFromSession(null);
    expect(access).toMatchObject({ permissions: [], assemblyId: undefined, concessionId: undefined, concessionWide: false });
  });

  it('is concession-wide only for a super admin at concession level', () => {
    expect(accessFromSession(session({ roles: ['CONCESSION_SUPER_ADMIN'], scopeLevel: 'CONCESSION', assemblyId: undefined })).concessionWide).toBe(true);
    expect(accessFromSession(session({ roles: ['CONCESSION_SUPER_ADMIN'], scopeLevel: 'ASSEMBLY' })).concessionWide).toBe(false);
    expect(accessFromSession(session({ roles: ['ASSEMBLY_ADMIN'], scopeLevel: 'CONCESSION' })).concessionWide).toBe(false);
  });

  it('treats a missing scope level as assembly-level', () => {
    expect(accessFromSession(session({ scopeLevel: undefined })).scopeLevel).toBe('ASSEMBLY');
  });
});
