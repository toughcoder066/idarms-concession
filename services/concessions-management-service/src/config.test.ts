import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep the local .env out of these tests.
vi.mock('dotenv/config', () => ({}));

const KEYS = ['NODE_ENV', 'AUTH_MODE', 'HOST', 'DATABASE_URL', 'PORTAL_URL', 'CROIP_INTEGRATION_URL'] as const;
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

const PROD = { NODE_ENV: 'production', PORTAL_URL: 'https://portal.example' } as const;

describe('CROIP_INTEGRATION_URL guard (bearer tokens are forwarded there)', () => {
  it('refuses the http default in production', async () => {
    await expect(loadConfig(PROD)).rejects.toThrow('CROIP_INTEGRATION_URL must use https');
  });

  it('refuses an explicit http URL in production', async () => {
    await expect(loadConfig({ ...PROD, CROIP_INTEGRATION_URL: 'http://croip-integration:3090' }))
      .rejects.toThrow('CROIP_INTEGRATION_URL must use https');
  });

  it('accepts https in production', async () => {
    const config = await loadConfig({ ...PROD, CROIP_INTEGRATION_URL: 'https://croip-integration.internal' });
    expect(config.croipIntegrationUrl).toBe('https://croip-integration.internal');
  });

  it('keeps the local http default in development', async () => {
    const config = await loadConfig({ NODE_ENV: 'development' });
    expect(config.croipIntegrationUrl).toBe('http://localhost:3090');
  });
});
