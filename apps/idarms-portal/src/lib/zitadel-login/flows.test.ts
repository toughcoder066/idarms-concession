import { describe, expect, it, vi } from 'vitest';
import { ZitadelApiError, type LoginApi } from './client';
import {
  acceptInvite,
  checkPassword,
  finishAuthRequest,
  replaceRequiredPassword,
  requestPasswordReset,
  resetPassword,
  startAuthRequest,
  unmetRules,
} from './flows';

type Handler = (body: any) => unknown;

/** A scripted ZITADEL: routes are "METHOD /path"; a thrown value becomes the failure. */
function fakeZitadel(routes: Record<string, Handler | unknown>) {
  const calls: Array<{ route: string; body: any }> = [];
  const api: LoginApi = {
    async call<T>(method: string, path: string, body?: unknown): Promise<T> {
      const route = `${method} ${path}`;
      calls.push({ route, body });
      if (!(route in routes)) throw new ZitadelApiError(404, 5, `unexpected ${route}`);
      const handler = routes[route];
      return (typeof handler === 'function' ? (handler as Handler)(body) : handler) as T;
    },
  };
  return { api, calls, routes: () => calls.map((call) => call.route) };
}

const fail = (status: number, code?: number) => () => {
  throw new ZitadelApiError(status, code, `HTTP ${status}`);
};

const sessionRoutes = {
  'POST /v2/sessions': { sessionId: 's-1', sessionToken: 'st-1' },
  'GET /v2/sessions/s-1': { session: { factors: { user: { id: '100', organizationId: '200' } } } },
};

describe('checkPassword', () => {
  it('returns the session, user and org for a correct password', async () => {
    const { api, calls } = fakeZitadel({ ...sessionRoutes, 'GET /v2/users/100': { user: { human: {} } } });

    const result = await checkPassword(api, 'ama', 'Secret-1!');

    expect(result).toEqual({
      ok: true, sessionId: 's-1', sessionToken: 'st-1', userId: '100', orgId: '200', passwordChangeRequired: false,
    });
    expect(calls[0].body).toEqual({ checks: { user: { loginName: 'ama' }, password: { password: 'Secret-1!' } } });
  });

  it('reports a required password change', async () => {
    const { api } = fakeZitadel({ ...sessionRoutes, 'GET /v2/users/100': { user: { human: { passwordChangeRequired: true } } } });

    const result = await checkPassword(api, 'ama', 'Secret-1!');

    expect(result).toMatchObject({ ok: true, passwordChangeRequired: true });
  });

  it.each([
    ['a wrong password', 400, 3],
    ['an unknown user', 404, 5],
    ['a locked account', 412, 9],
  ])('answers the same "invalid" for %s', async (_label, status, code) => {
    const { api } = fakeZitadel({ 'POST /v2/sessions': fail(status, code) });

    expect(await checkPassword(api, 'ama', 'x')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports unavailable when ZITADEL fails', async () => {
    const { api } = fakeZitadel({ 'POST /v2/sessions': fail(503) });

    expect(await checkPassword(api, 'ama', 'x')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('ends the session it created when a later step fails', async () => {
    const { api, routes } = fakeZitadel({
      ...sessionRoutes,
      'GET /v2/users/100': fail(500),
      'DELETE /v2/sessions/s-1': {},
    });

    expect(await checkPassword(api, 'ama', 'Secret-1!')).toEqual({ ok: false, reason: 'unavailable' });
    expect(routes()).toContain('DELETE /v2/sessions/s-1');
  });
});

describe('startAuthRequest', () => {
  const issuer = 'http://localhost:8080';
  const authorize = `${issuer}/oauth/v2/authorize?client_id=c&redirect_uri=x`;
  const redirectTo = (location: string) => vi.fn(async () => new Response(null, { status: 302, headers: { location } }));

  it('reads the auth request id from the authorize redirect without following it', async () => {
    const fetchImpl = redirectTo('http://localhost:3000/login?authRequest=V2_123456');

    expect(await startAuthRequest(authorize, issuer, fetchImpl as unknown as typeof fetch)).toBe('V2_123456');
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'manual' }));
  });

  it('refuses an authorization URL that is not the configured issuer', async () => {
    const fetchImpl = redirectTo('http://localhost:3000/login?authRequest=V2_1');

    await expect(startAuthRequest('https://evil.test/oauth/v2/authorize', issuer, fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/not the configured ZITADEL issuer/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a redirect without a well-formed auth request', async () => {
    const fetchImpl = redirectTo('http://localhost:3000/login?authRequest=../../etc');

    await expect(startAuthRequest(authorize, issuer, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/auth request/);
  });
});

describe('finishAuthRequest', () => {
  const session = { sessionId: 's-1', sessionToken: 'st-1' };
  const expected = 'http://localhost:3000/api/auth/callback/zitadel';

  it('returns the portal callback with the code', async () => {
    const { api, calls } = fakeZitadel({
      'POST /v2/oidc/auth_requests/V2_1': { callbackUrl: `${expected}?code=abc&state=xyz` },
    });

    expect(await finishAuthRequest(api, 'V2_1', session, expected)).toBe(`${expected}?code=abc&state=xyz`);
    expect(calls[0].body).toEqual({ session: { sessionId: 's-1', sessionToken: 'st-1' } });
  });

  it.each([
    ['another origin', 'https://evil.test/api/auth/callback/zitadel?code=abc'],
    ['another path', 'http://localhost:3000/somewhere?code=abc'],
    ['no code', `${expected}?error=access_denied`],
  ])('refuses a callback to %s', async (_label, callbackUrl) => {
    const { api } = fakeZitadel({ 'POST /v2/oidc/auth_requests/V2_1': { callbackUrl } });

    await expect(finishAuthRequest(api, 'V2_1', session, expected)).rejects.toThrow(/portal callback/);
  });
});

describe('requestPasswordReset', () => {
  it('emails a link built from the configured portal URL', async () => {
    const { api, calls } = fakeZitadel({
      'POST /v2/users': { result: [{ userId: '100' }] },
      'POST /v2/users/100/password_reset': {},
    });

    await requestPasswordReset(api, 'ama', 'https://portal.example.test/');

    expect(calls[1].body).toEqual({
      sendLink: {
        notificationType: 'NOTIFICATION_TYPE_Email',
        urlTemplate: 'https://portal.example.test/password/reset?userId={{.UserID}}&code={{.Code}}&orgId={{.OrgID}}',
      },
    });
  });

  it('does nothing visible for an unknown account', async () => {
    const { api, routes } = fakeZitadel({ 'POST /v2/users': { result: [] } });

    await expect(requestPasswordReset(api, 'nobody', 'https://portal.example.test')).resolves.toBeUndefined();
    expect(routes()).toEqual(['POST /v2/users']);
  });

  it('swallows ZITADEL errors so the answer never differs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = fakeZitadel({ 'POST /v2/users': { result: [{ userId: '100' }] }, 'POST /v2/users/100/password_reset': fail(412) });

    await expect(requestPasswordReset(api, 'ama', 'https://portal.example.test')).resolves.toBeUndefined();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ama');
    warn.mockRestore();
  });
});

describe('codes before passwords', () => {
  it('resets a password with the emailed code', async () => {
    const { api, calls } = fakeZitadel({ 'POST /v2/users/100/password': {} });

    expect(await resetPassword(api, '100', 'CODE', 'New-Pass-1!')).toEqual({ ok: true });
    expect(calls[0].body).toEqual({ newPassword: { password: 'New-Pass-1!', changeRequired: false }, verificationCode: 'CODE' });
  });

  it('reports a rejected reset code', async () => {
    const { api } = fakeZitadel({ 'POST /v2/users/100/password': fail(400, 3) });

    expect(await resetPassword(api, '100', 'BAD', 'New-Pass-1!')).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('verifies the invite code before setting the first password', async () => {
    const { api, routes } = fakeZitadel({ 'POST /v2/users/100/invite_code/verify': {}, 'POST /v2/users/100/password': {} });

    expect(await acceptInvite(api, '100', 'INVITE', 'First-Pass-1!')).toEqual({ ok: true });
    expect(routes()).toEqual(['POST /v2/users/100/invite_code/verify', 'POST /v2/users/100/password']);
  });

  it('never sets a password when the invite code is rejected', async () => {
    const { api, routes } = fakeZitadel({ 'POST /v2/users/100/invite_code/verify': fail(400, 3) });

    expect(await acceptInvite(api, '100', 'BAD', 'First-Pass-1!')).toEqual({ ok: false, reason: 'invalid_code' });
    expect(routes()).not.toContain('POST /v2/users/100/password');
  });

  it('replaces a required password with a server-issued code', async () => {
    const { api, calls } = fakeZitadel({
      'POST /v2/users/100/password_reset': { verificationCode: 'SERVER-CODE' },
      'POST /v2/users/100/password': {},
    });

    expect(await replaceRequiredPassword(api, '100', 'New-Pass-1!')).toEqual({ ok: true });
    expect(calls[0].body).toEqual({ returnCode: {} });
    expect(calls[1].body).toMatchObject({ verificationCode: 'SERVER-CODE' });
  });
});

describe('unmetRules', () => {
  const rules = { minLength: 10, requiresUppercase: true, requiresLowercase: true, requiresNumber: true, requiresSymbol: true };

  it('lists every rule the password misses', () => {
    expect(unmetRules('short', rules)).toEqual(['at least 10 characters', 'an uppercase letter', 'a number', 'a symbol']);
  });

  it('accepts a password that meets every rule', () => {
    expect(unmetRules('Long-enough-1', rules)).toEqual([]);
  });
});
