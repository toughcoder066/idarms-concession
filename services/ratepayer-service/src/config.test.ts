import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep the local .env out of these tests: dotenv would fill any variable a
// case deliberately leaves unset.
vi.mock('dotenv/config', () => ({}));

const KEYS = ['NODE_ENV', 'AUTH_MODE', 'HOST', 'DATABASE_URL', 'ZITADEL_PROJECT_ID'] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

async function loadConfig(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, { DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', ...env });
  vi.resetModules();
  return (await import('./config.js')).config;
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('auth mode guard', () => {
  it('defaults to zitadel when AUTH_MODE is unset', async () => {
    const config = await loadConfig({ NODE_ENV: 'development' });
    expect(config.authMode).toBe('zitadel');
  });

  it('defaults to zitadel when nothing is set', async () => {
    const config = await loadConfig({});
    expect(config.authMode).toBe('zitadel');
  });

  it('allows zitadel on all interfaces', async () => {
    const config = await loadConfig({ NODE_ENV: 'development', AUTH_MODE: 'zitadel', HOST: '0.0.0.0' });
    expect(config.authMode).toBe('zitadel');
  });

  it('refuses disabled in production', async () => {
    await expect(loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'disabled', HOST: '127.0.0.1' }))
      .rejects.toThrow(/forbidden when NODE_ENV=production/);
  });

  it.each(['0.0.0.0', '::', '192.168.1.20'])('refuses disabled in development on %s', async (host) => {
    await expect(loadConfig({ NODE_ENV: 'development', AUTH_MODE: 'disabled', HOST: host }))
      .rejects.toThrow(/requires a loopback HOST/);
  });

  it('refuses disabled when HOST falls back to its 0.0.0.0 default', async () => {
    await expect(loadConfig({ AUTH_MODE: 'disabled' })).rejects.toThrow(/requires a loopback HOST/);
  });

  it.each(['127.0.0.1', 'localhost', '::1'])('allows disabled in development on %s', async (host) => {
    const config = await loadConfig({ NODE_ENV: 'development', AUTH_MODE: 'disabled', HOST: host });
    expect(config.authMode).toBe('disabled');
  });

  it('allows disabled in tests, which never open a port', async () => {
    const config = await loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'disabled' });
    expect(config.authMode).toBe('disabled');
  });
});

describe('ZITADEL_PROJECT_ID', () => {
  it('accepts a numeric ZITADEL project id', async () => {
    const config = await loadConfig({ NODE_ENV: 'test', ZITADEL_PROJECT_ID: '395947172589207555' });
    expect(config.zitadelProjectId).toBe('395947172589207555');
  });

  it.each(['', 'not-a-number', '1234-5678'])('refuses %j', async (value) => {
    await expect(loadConfig({ NODE_ENV: 'test', ZITADEL_PROJECT_ID: value }))
      .rejects.toThrow(/Invalid environment configuration/);
  });
});
