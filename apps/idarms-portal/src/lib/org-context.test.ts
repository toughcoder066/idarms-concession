import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configMock = vi.hoisted(() => ({
  appConfig: { serviceBaseUrls: { concessions: 'http://concessions.test/v1/' } },
}));
vi.mock('./config', () => configMock);

import { clearOrgContextCache, ORG_CONTEXT_TTL_MS, resolveOrgContext } from './org-context';

const HOME = '100000000000000001';
const OTHER = '100000000000000002';
const TOKEN = 'eyJ.portal-access-token.sig';
const home = { orgId: HOME, concessionId: 'conc-1', assemblyId: 'asm-1', scope: 'ASSEMBLY' };

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  clearOrgContextCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('portal org-context lookup', () => {
  it('asks /org-context/me with the access token', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, home));

    await expect(resolveOrgContext(HOME, TOKEN)).resolves.toEqual(home);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://concessions.test/v1/org-context/me');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('refuses an answer for another org', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ...home, orgId: OTHER }));

    await expect(resolveOrgContext(HOME, TOKEN)).resolves.toBeNull();
  });

  it('never caches a refused token', async () => {
    fetchMock.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, home));

    await expect(resolveOrgContext(HOME, TOKEN)).resolves.toBeNull();
    await expect(resolveOrgContext(HOME, TOKEN)).resolves.toEqual(home);
  });

  it('expires a cached context after ORG_CONTEXT_TTL_MS', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(reply(200, home)).mockResolvedValueOnce(reply(404));

    await resolveOrgContext(HOME, TOKEN);
    vi.advanceTimersByTime(ORG_CONTEXT_TTL_MS + 1);
    await expect(resolveOrgContext(HOME, TOKEN)).resolves.toBeNull();
  });

  it('refuses plain http in production without sending the token', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(resolveOrgContext(HOME, TOKEN)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errors.mock.calls.flat().join(' ')).not.toContain(TOKEN);
    errors.mockRestore();
  });
});
