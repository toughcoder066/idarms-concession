import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// How to test a route as different users with the shared fixtures in src/testing
// (docs/LOCAL_DEVELOPMENT.md). Signed tokens go through the service's real ZITADEL
// verification against a local test issuer; the org registry is mocked from the
// same personas. No live ZITADEL or concessions-management is needed.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'zitadel';
  process.env.ZITADEL_ISSUER = 'http://issuer.test';
  process.env.ZITADEL_AUDIENCE = 'idarms-audience';
  process.env.ZITADEL_JWKS_URI = 'http://127.0.0.1:1/oauth/v2/keys';
  process.env.ZITADEL_PROJECT_ID = '111111111111111111';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
});

vi.mock('dotenv/config', () => ({}));
vi.mock('../lib/org-context', async () => {
  const { testOrgContext } = await import('./personas.js');
  return { resolveOrgContext: vi.fn(async (orgId: string) => testOrgContext(orgId)) };
});

import { config } from '../config';
import { registerRoutes } from '../modules/ratepayers/routes';
import { registerAuthPlugin } from '../plugins/auth';
import { TEST_ORGS, TEST_USERS, type TestUser } from './personas';
import { startTestIssuer, type TestIssuer } from './zitadel-test-issuer';

const prisma = { ratepayer: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) } };

let app: FastifyInstance;
let issuer: TestIssuer;

beforeAll(async () => {
  issuer = await startTestIssuer();
  config.zitadelJwksUri = issuer.jwksUri;
  app = Fastify();
  await registerAuthPlugin(app);
  app.decorate('prisma', prisma as never);
  await app.register(registerRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await issuer.close();
});

beforeEach(() => vi.clearAllMocks());

async function listAs(user: TestUser) {
  return app.inject({ method: 'GET', url: '/v1/ratepayers', headers: { authorization: `Bearer ${await issuer.accessToken(user)}` } });
}

const scopeOfLastQuery = () =>
  (prisma.ratepayer.findMany.mock.calls.at(-1) as unknown as [{ where: Record<string, unknown> }])[0].where;

describe('ratepayer list as different users', () => {
  it('scopes an assembly user to their own assembly', async () => {
    expect((await listAs(TEST_USERS.viewerA2)).statusCode).toBe(200);
    expect(scopeOfLastQuery()).toMatchObject({ concessionId: TEST_ORGS.assemblyA2.concessionId, assemblyId: TEST_ORGS.assemblyA2.assemblyId });
  });

  it('keeps assemblies of another concession apart', async () => {
    expect((await listAs(TEST_USERS.assemblyAdminB1)).statusCode).toBe(200);
    expect(scopeOfLastQuery()).toMatchObject({ concessionId: TEST_ORGS.assemblyB1.concessionId, assemblyId: TEST_ORGS.assemblyB1.assemblyId });
  });

  it('gives the concession admin a concession-wide read', async () => {
    expect((await listAs(TEST_USERS.concessionAdminA)).statusCode).toBe(200);
    expect(scopeOfLastQuery()).toMatchObject({ concessionId: TEST_ORGS.concessionA.concessionId });
    expect(scopeOfLastQuery()).not.toHaveProperty('assemblyId');
  });

  it.each([
    ['no role', TEST_USERS.noRoleA1, 403],
    ['a role only in another org', TEST_USERS.foreignRoleA1, 403],
    ['an unregistered org', TEST_USERS.unregistered, 403],
    ['no home org claim', TEST_USERS.noHomeOrg, 401],
  ])('refuses a user with %s', async (_label, user, status) => {
    expect((await listAs(user)).statusCode).toBe(status);
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

  it('refuses ID tokens and expired tokens', async () => {
    const user = TEST_USERS.assemblyAdminA1;
    for (const token of [await issuer.idToken(user), await issuer.expiredAccessToken(user), await issuer.foreignKeyToken(user)]) {
      const response = await app.inject({ method: 'GET', url: '/v1/ratepayers', headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(401);
    }
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });
});
