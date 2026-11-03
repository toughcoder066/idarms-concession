import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ZitadelApiError, ZitadelLoginClient } from './client';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const machineKey = {
  keyId: 'kid-1',
  userId: 'login-client',
  key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

function client(handler: (url: URL, init: RequestInit) => Response | Promise<Response>, now = () => 1_000_000) {
  const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => handler(new URL(String(input)), init ?? {}));
  return {
    fetchImpl,
    api: new ZitadelLoginClient({ issuer: 'http://localhost:8080/', machineKey, fetchImpl: fetchImpl as unknown as typeof fetch, now }),
  };
}

const tokenResponse = () => new Response(JSON.stringify({ access_token: 'login-token', expires_in: 300 }));

describe('ZitadelLoginClient', () => {
  it('signs a JWT-profile assertion with the machine key and reuses the token', async () => {
    const { api, fetchImpl } = client((url, init) => {
      if (url.pathname === '/oauth/v2/token') {
        const form = new URLSearchParams(String(init.body));
        expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
        const [, payload] = String(form.get('assertion')).split('.');
        expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
          iss: 'login-client', sub: 'login-client', aud: 'http://localhost:8080',
        });
        return tokenResponse();
      }
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer login-token');
      return new Response(JSON.stringify({ ok: true }));
    });

    await api.call('GET', '/v2/users/1');
    await api.call('GET', '/v2/users/2');

    expect(fetchImpl.mock.calls.filter(([input]) => String(input).endsWith('/oauth/v2/token'))).toHaveLength(1);
  });

  it('shares one token request between concurrent calls', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { api, fetchImpl } = client(async (url) => {
      if (url.pathname === '/oauth/v2/token') {
        await gate;
        return tokenResponse();
      }
      return new Response('{}');
    });

    const calls = Promise.all([api.call('GET', '/a'), api.call('GET', '/b'), api.call('GET', '/c')]);
    release();
    await calls;

    expect(fetchImpl.mock.calls.filter(([input]) => String(input).endsWith('/oauth/v2/token'))).toHaveLength(1);
  });

  it('fetches a new token once the cached one is about to expire', async () => {
    let now = 1_000_000;
    const { api, fetchImpl } = client((url) => (url.pathname === '/oauth/v2/token' ? tokenResponse() : new Response('{}')), () => now);

    await api.call('GET', '/a');
    now += 280_000;
    await api.call('GET', '/b');

    expect(fetchImpl.mock.calls.filter(([input]) => String(input).endsWith('/oauth/v2/token'))).toHaveLength(2);
  });

  it('turns a ZITADEL error into ZitadelApiError without echoing secrets', async () => {
    const { api } = client((url) => (url.pathname === '/oauth/v2/token'
      ? tokenResponse()
      : new Response(JSON.stringify({ code: 3, message: 'Password is invalid' }), { status: 400 })));

    const error = await api.call('POST', '/v2/sessions', { checks: { password: { password: 'Secret-1!' } } }).catch((e) => e);

    expect(error).toBeInstanceOf(ZitadelApiError);
    expect(error).toMatchObject({ status: 400, code: 3 });
    expect(error.message).not.toContain('Secret-1!');
    expect(error.message).not.toContain('login-token');
  });

  it('reports a failed token request without the key', async () => {
    const { api } = client(() => new Response('{"error":"invalid_grant"}', { status: 400 }));

    const error = await api.call('GET', '/a').catch((e) => e);

    expect(error).toBeInstanceOf(ZitadelApiError);
    expect(error.message).not.toContain('PRIVATE KEY');
  });
});
