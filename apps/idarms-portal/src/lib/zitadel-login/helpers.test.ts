import { afterEach, describe, expect, it } from 'vitest';
import { seal, unseal } from './cookies';
import { RateLimiter } from './rate-limit';
import { clientIp, isZitadelId, portalUrl, safeRedirectPath } from './request';

const SECRET = 'test-secret-with-enough-length-for-jwe-0123456789';

describe('sealed cookies', () => {
  it('round-trips a value', async () => {
    const sealed = await seal('idarms_login_pending', { sessionId: 's-1', userId: '100' }, 600, SECRET);

    expect(sealed).not.toContain('s-1');
    expect(await unseal('idarms_login_pending', sealed, SECRET)).toMatchObject({ sessionId: 's-1', userId: '100' });
  });

  it('rejects a tampered cookie, a wrong secret and another cookie name', async () => {
    const sealed = await seal('idarms_login_pending', { sessionId: 's-1' }, 600, SECRET);
    const tampered = `${sealed.slice(0, -4)}AAAA`;

    expect(await unseal('idarms_login_pending', tampered, SECRET)).toBeNull();
    expect(await unseal('idarms_login_pending', sealed, `${SECRET}-other`)).toBeNull();
    expect(await unseal('idarms_zitadel_session', sealed, SECRET)).toBeNull();
    expect(await unseal('idarms_login_pending', undefined, SECRET)).toBeNull();
  });

  it('rejects an expired cookie (beyond Auth.js\'s 15 s clock tolerance)', async () => {
    const sealed = await seal('idarms_login_pending', { sessionId: 's-1' }, -120, SECRET);

    expect(await unseal('idarms_login_pending', sealed, SECRET)).toBeNull();
  });
});

describe('safeRedirectPath', () => {
  it.each([
    ['/ratepayers?page=2', '/ratepayers?page=2'],
    ['/dashboard', '/dashboard'],
    ['//evil.test/x', '/dashboard'],
    ['/\\evil.test', '/dashboard'],
    ['https://evil.test/x', '/dashboard'],
    ['/api/auth/signout', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    [undefined, '/dashboard'],
  ])('maps %j to %j', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it('accepts an absolute URL only on the portal origin', () => {
    expect(safeRedirectPath('http://localhost:3000/properties', 'http://localhost:3000')).toBe('/properties');
    expect(safeRedirectPath('http://evil.test/properties', 'http://localhost:3000')).toBe('/dashboard');
  });
});

describe('portalUrl', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('comes from AUTH_URL, not from a request', () => {
    process.env.AUTH_URL = 'https://portal.example.test/some/path';
    expect(portalUrl()).toBe('https://portal.example.test');
  });

  it('must be https in production', () => {
    Object.assign(process.env, { NODE_ENV: 'production', AUTH_URL: 'http://portal.example.test' });
    expect(() => portalUrl()).toThrow(/https/);
  });
});

describe('request helpers', () => {
  it('reads the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIp(new Headers())).toBe('unknown');
  });

  it('accepts only numeric ZITADEL ids', () => {
    expect(isZitadelId('397994751271370756')).toBe(true);
    expect(isZitadelId('1; drop')).toBe(false);
    expect(isZitadelId(['1'])).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);

    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([true, true, false]);
    expect(limiter.hit('b')).toBe(true);
    now = 1001;
    expect(limiter.hit('a')).toBe(true);
  });
});
