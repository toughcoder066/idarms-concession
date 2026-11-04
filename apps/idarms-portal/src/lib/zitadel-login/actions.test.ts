import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZitadelApiError, type LoginApi } from './client';

const state = vi.hoisted(() => ({
  ip: '198.51.100.1',
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ route: string; body: unknown }>,
}));

const api: LoginApi = {
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const route = `${method} ${path}`;
    state.calls.push({ route, body });
    const handler = state.routes[route];
    if (handler === undefined) throw new ZitadelApiError(404, 5, `unexpected ${route}`);
    if (handler instanceof ZitadelApiError) throw handler;
    return handler as T;
  },
};

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': state.ip }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
}));
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  loginClient: () => api,
}));
vi.mock('./sign-in', () => ({ completeSignIn: vi.fn(async () => 'http://localhost:3000/api/auth/callback/zitadel?code=c&state=s') }));
vi.mock('./cookies', () => ({
  setPendingLogin: vi.fn(async () => {}),
  readPendingLogin: vi.fn(async () => null),
  clearPendingLogin: vi.fn(async () => {}),
}));

const { loginAction } = await import('@/app/(auth)/login/actions');
const { acceptInviteAction } = await import('@/app/(auth)/invite/accept/actions');
const { changeRequiredPasswordAction } = await import('@/app/(auth)/password/change/actions');
const { completeSignIn } = await import('./sign-in');
const cookies = await import('./cookies');

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const redirectOf = async (promise: Promise<unknown>) => promise.then(() => undefined, (error: { url?: string }) => error.url);

const goodSession = {
  'POST /v2/sessions': { sessionId: 's-1', sessionToken: 'st-1' },
  'GET /v2/sessions/s-1': { session: { factors: { user: { id: '100', organizationId: '200' } } } },
  'GET /v2/users/100': { user: { human: {} } },
};
const rules = { 'GET /v2/settings/password/complexity?ctx.orgId=200': { settings: { minLength: '8', requiresUppercase: true, requiresLowercase: true, requiresNumber: true, requiresSymbol: true } } };

let ipCounter = 0;
beforeEach(() => {
  vi.clearAllMocks();
  state.calls.length = 0;
  state.routes = {};
  state.ip = `198.51.100.${(ipCounter += 1)}`;
});

describe('loginAction', () => {
  it('asks for both fields without calling ZITADEL', async () => {
    expect(await loginAction({}, form({ loginName: 'ama' }))).toEqual({ error: expect.stringMatching(/username and password/) });
    expect(state.calls).toEqual([]);
  });

  it('gives one generic message for a wrong password and never echoes it', async () => {
    state.routes = { 'POST /v2/sessions': new ZitadelApiError(400, 3, 'invalid') };

    const result = await loginAction({}, form({ loginName: 'ama', password: 'Wrong-Pass-1!' }));

    expect(result.error).toMatch(/username or password is incorrect/);
    expect(JSON.stringify(result)).not.toContain('Wrong-Pass-1!');
    expect(completeSignIn).not.toHaveBeenCalled();
  });

  it('gives the same message for an unknown account', async () => {
    state.routes = { 'POST /v2/sessions': new ZitadelApiError(404, 5, 'not found') };

    const result = await loginAction({}, form({ loginName: 'nobody', password: 'x' }));

    expect(result.error).toMatch(/username or password is incorrect/);
  });

  it('completes the sign-in and hands the portal callback to the browser for a full page load', async () => {
    state.routes = goodSession;

    const result = await loginAction({}, form({ loginName: 'ama', password: 'Right-Pass-1!', redirectTo: '/ratepayers' }));

    expect(result).toEqual({ redirectTo: 'http://localhost:3000/api/auth/callback/zitadel?code=c&state=s' });
    expect(completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's-1', sessionToken: 'st-1' }), '/ratepayers');
  });

  it('never redirects off-site after sign-in', async () => {
    state.routes = goodSession;

    await redirectOf(loginAction({}, form({ loginName: 'ama', password: 'Right-Pass-1!', redirectTo: '//evil.test/x' })));

    expect(completeSignIn).toHaveBeenCalledWith(expect.anything(), '/dashboard');
  });

  it('sends a user who must change their password to /password/change first', async () => {
    state.routes = { ...goodSession, 'GET /v2/users/100': { user: { human: { passwordChangeRequired: true } } } };

    const url = await redirectOf(loginAction({}, form({ loginName: 'ama', password: 'Right-Pass-1!' })));

    expect(url).toBe('/password/change');
    expect(cookies.setPendingLogin).toHaveBeenCalledWith({
      sessionId: 's-1', sessionToken: 'st-1', userId: '100', orgId: '200', redirectTo: '/dashboard',
    });
    expect(completeSignIn).not.toHaveBeenCalled();
  });

  it('ends the ZITADEL session when the sign-in cannot complete', async () => {
    state.routes = { ...goodSession, 'DELETE /v2/sessions/s-1': {} };
    vi.mocked(completeSignIn).mockRejectedValueOnce(new Error('authorize failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await loginAction({}, form({ loginName: 'ama', password: 'Right-Pass-1!' }));

    expect(result.error).toMatch(/temporarily unavailable/);
    expect(state.calls.map((call) => call.route)).toContain('DELETE /v2/sessions/s-1');
  });

  it('limits attempts per username across addresses', async () => {
    state.routes = { 'POST /v2/sessions': new ZitadelApiError(400, 3, 'invalid') };
    const results = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      state.ip = `203.0.113.${attempt}`;
      results.push(await loginAction({}, form({ loginName: 'target-user', password: 'guess' })));
    }

    expect(results.at(-1)?.error).toMatch(/Too many attempts/);
    expect(state.calls.filter((call) => call.route === 'POST /v2/sessions')).toHaveLength(8);
  });
});

describe('acceptInviteAction', () => {
  const invite = { userId: '100', code: 'INVITE', orgId: '200' };

  it('refuses a weak password before spending the invite code', async () => {
    state.routes = rules;

    const result = await acceptInviteAction({}, form({ ...invite, password: 'weak', confirm: 'weak' }));

    expect(result.error).toMatch(/needs at least 8 characters/);
    expect(state.calls.map((call) => call.route)).not.toContain('POST /v2/users/100/invite_code/verify');
  });

  it('refuses mismatched passwords without calling ZITADEL', async () => {
    expect((await acceptInviteAction({}, form({ ...invite, password: 'Strong-Pass-1!', confirm: 'Other-Pass-1!' }))).error)
      .toMatch(/do not match/);
    expect(state.calls).toEqual([]);
  });

  it('refuses a malformed link without calling ZITADEL', async () => {
    expect((await acceptInviteAction({}, form({ userId: '../1', code: 'x', password: 'a', confirm: 'a' }))).error)
      .toMatch(/invitation link is invalid/);
    expect(state.calls).toEqual([]);
  });

  it('verifies the code, sets the password and sends the user to sign in', async () => {
    state.routes = { ...rules, 'POST /v2/users/100/invite_code/verify': {}, 'POST /v2/users/100/password': {} };

    const url = await redirectOf(acceptInviteAction({}, form({ ...invite, password: 'Strong-Pass-1!', confirm: 'Strong-Pass-1!' })));

    expect(url).toBe('/login?invited=1');
  });
});

describe('changeRequiredPasswordAction', () => {
  it('sends the user back to sign in when there is no pending sign-in', async () => {
    expect(await redirectOf(changeRequiredPasswordAction({}, form({ password: 'a', confirm: 'a' })))).toBe('/login?expired=1');
    expect(state.calls).toEqual([]);
  });
});
