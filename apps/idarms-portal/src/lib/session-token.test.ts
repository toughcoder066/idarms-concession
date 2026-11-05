import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from './org-context';
import { claimsFromAccessToken, endedToken, refreshAccessToken, rolesFromAccessToken, sessionEndPath } from './session-token';

vi.mock('./org-context', () => ({ resolveOrgContext: async () => null }));

const HOME = '100000000000000001';
const OTHER = '100000000000000002';

function jwt(payload: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

function accessToken(roles: Record<string, string[]>, homeOrgId: string | null = HOME): string {
  const claim: Record<string, Record<string, string>> = {};
  for (const [role, orgs] of Object.entries(roles)) claim[role] = Object.fromEntries(orgs.map((org) => [org, 'org.local']));
  return jwt({
    sub: 'user-1',
    ...(homeOrgId ? { 'urn:zitadel:iam:user:resourceowner:id': homeOrgId } : {}),
    'urn:zitadel:iam:org:project:roles': claim,
  });
}

const assemblyOrg: OrgContext = { orgId: HOME, concessionId: 'conc-1', assemblyId: 'asm-1', scope: 'ASSEMBLY' };
const portfolioOrg: OrgContext = { orgId: HOME, concessionId: 'conc-1', assemblyId: null, scope: 'CONCESSION' };

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('roles come only from the home organisation', () => {
  it('reads roles granted in the home org', () => {
    expect(rolesFromAccessToken(accessToken({ SECRETARY: [HOME] })).roles).toEqual(['SECRETARY']);
  });

  it('ignores roles granted in another org', () => {
    expect(rolesFromAccessToken(accessToken({ ASSEMBLY_ADMIN: [OTHER], SECRETARY: [HOME] })).roles).toEqual(['SECRETARY']);
  });

  it('gives no roles without the home org claim', () => {
    expect(rolesFromAccessToken(accessToken({ SECRETARY: [HOME] }, null)).roles).toEqual([]);
  });

  it('gives no roles for a missing or malformed token', () => {
    expect(rolesFromAccessToken(undefined).roles).toEqual([]);
    expect(rolesFromAccessToken('not-a-jwt').roles).toEqual([]);
  });
});

describe('session claims follow the org registry, like the services', () => {
  it('takes tenant and scope level from the org context', async () => {
    const claims = await claimsFromAccessToken(accessToken({ SECRETARY: [HOME] }), async () => assemblyOrg);
    expect(claims).toMatchObject({ concessionId: 'conc-1', assemblyId: 'asm-1', scopeLevel: 'ASSEMBLY' });
    expect(claims.permissions).toContain('ratepayer:create');
  });

  it('does not make a super admin concession-level when the registry says assembly', async () => {
    const claims = await claimsFromAccessToken(accessToken({ CONCESSION_SUPER_ADMIN: [HOME] }), async () => assemblyOrg);
    expect(claims.scopeLevel).toBe('ASSEMBLY');
  });

  it('is concession-level when the registry says so', async () => {
    const claims = await claimsFromAccessToken(accessToken({ CONCESSION_SUPER_ADMIN: [HOME] }), async () => portfolioOrg);
    expect(claims).toMatchObject({ scopeLevel: 'CONCESSION', concessionId: 'conc-1', assemblyId: undefined });
  });

  it('guesses no tenant when the registry has no entry', async () => {
    const claims = await claimsFromAccessToken(accessToken({ SECRETARY: [HOME] }), async () => null);
    expect(claims).toMatchObject({ concessionId: undefined, assemblyId: undefined, scopeLevel: undefined, assemblyIds: [] });
  });

  it('does not look up the registry for a user with no roles', async () => {
    const lookup = vi.fn(async () => assemblyOrg);
    const claims = await claimsFromAccessToken(accessToken({}), lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(claims.roles).toEqual([]);
    expect(claims.permissions).toEqual([]);
  });

  it('asks the registry for the home org with that same access token', async () => {
    const token = accessToken({ SECRETARY: [HOME] });
    const lookup = vi.fn(async () => assemblyOrg);
    await claimsFromAccessToken(token, lookup);
    expect(lookup).toHaveBeenCalledExactlyOnceWith(HOME, token);
  });

  it('does not look up the registry without an access token', async () => {
    const lookup = vi.fn(async () => assemblyOrg);
    const claims = await claimsFromAccessToken(undefined, lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(claims.concessionId).toBeUndefined();
  });
});

describe('a failed refresh ends the session instead of keeping the stale token', () => {
  const NOW = 1_800_000_000;
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ZITADEL_ISSUER = 'http://zitadel.test/';
    process.env.ZITADEL_CLIENT_ID = 'portal';
    process.env.ZITADEL_CLIENT_SECRET = 'portal-secret';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  const expiring = { accessToken: 'old', refreshToken: 'refresh-1', expiresAt: NOW + 10, userId: 'user-1' };
  const asFetch = (impl: (...args: unknown[]) => unknown) => vi.fn(impl) as unknown as typeof fetch;

  it('does not call ZITADEL while the token is still valid', async () => {
    const fetchImpl = asFetch(() => { throw new Error('should not be called'); });
    const token = { ...expiring, expiresAt: NOW + 3600 };
    expect(await refreshAccessToken(token, fetchImpl, NOW)).toBe(token);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the new tokens on success', async () => {
    const fetchImpl = asFetch(async () => new Response(JSON.stringify({
      access_token: 'new', refresh_token: 'refresh-2', expires_in: 600,
    })));
    const refreshed = await refreshAccessToken(expiring, fetchImpl, NOW);
    expect(refreshed).toMatchObject({ accessToken: 'new', refreshToken: 'refresh-2', expiresAt: NOW + 600 });
    expect(refreshed.error).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith('http://zitadel.test/oauth/v2/token', expect.anything());
  });

  it('marks the token when ZITADEL refuses the refresh', async () => {
    const fetchImpl = asFetch(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    expect((await refreshAccessToken(expiring, fetchImpl, NOW)).error).toBe('RefreshFailed');
  });

  it('marks the token when ZITADEL cannot be reached', async () => {
    const fetchImpl = asFetch(async () => { throw new Error('ECONNREFUSED'); });
    expect((await refreshAccessToken(expiring, fetchImpl, NOW)).error).toBe('RefreshFailed');
  });

  it('marks an expired token that has no refresh token', async () => {
    const fetchImpl = asFetch(() => { throw new Error('should not be called'); });
    const token = { ...expiring, refreshToken: undefined };
    expect((await refreshAccessToken(token, fetchImpl, NOW)).error).toBe('RefreshFailed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never logs the refresh token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = asFetch(async () => new Response('{}', { status: 400 }));
    await refreshAccessToken(expiring, fetchImpl, NOW);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('refresh-1');
  });
});

describe('an ended session', () => {
  it('drops every credential and claim except the refresh token to revoke', () => {
    const ended = endedToken({
      accessToken: 'a', idToken: 'i', refreshToken: 'r', userId: 'user-1',
      roles: ['SECRETARY'], permissions: ['ratepayer:create'], concessionId: 'conc-1', assemblyId: 'asm-1',
    }, 'NoRoles');
    expect(ended).toEqual({ error: 'NoRoles', userId: 'user-1', refreshToken: 'r', roles: [], permissions: [], assemblyIds: [] });
  });

  it('is sent to the sign-out route with its reason', () => {
    expect(sessionEndPath('NoRoles')).toBe('/session/end?reason=no_access');
    expect(sessionEndPath('RefreshFailed')).toBe('/session/end?reason=session_ended');
  });
});
