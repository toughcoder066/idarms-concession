import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// GET /v1/org-context/me through the real ZITADEL verification path, against the
// shared test issuer (src/testing): no live ZITADEL (ADR-0003 decision 10).
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

import { config } from '../../config';
import { registerAuthPlugin } from '../../plugins/auth';
import { TEST_ORGS, TEST_USERS, type TestUser } from '../../testing/personas';
import { startTestIssuer, type TestIssuer } from '../../testing/zitadel-test-issuer';
import { registerRoutes } from '../concessions/routes';

const { concessionA, assemblyA1, assemblyA2 } = TEST_ORGS;
const INACTIVE_ORG = '200000000000000777';
const inactiveUser: TestUser = { subject: 'user-inactive', homeOrgId: INACTIVE_ORG, roles: { ASSEMBLY_ADMIN: [INACTIVE_ORG] } };

const registryRows = Object.fromEntries([
  ...Object.values(TEST_ORGS).map((org) => [org.orgId, { ...org, status: 'ACTIVE' }]),
  [INACTIVE_ORG, { orgId: INACTIVE_ORG, concessionId: concessionA.concessionId, assemblyId: assemblyA2.assemblyId, scope: 'ASSEMBLY', status: 'INACTIVE' }],
]);

const prisma = {
  zitadelOrgContext: {
    findUnique: vi.fn(async ({ where }: { where: { orgId: string } }) => registryRows[where.orgId] ?? null),
  },
};

let app: FastifyInstance;
let issuer: TestIssuer;
const logLines: string[] = [];

beforeAll(async () => {
  issuer = await startTestIssuer();
  config.zitadelJwksUri = issuer.jwksUri;
  app = Fastify({ logger: { level: 'info', stream: { write: (line: string) => { logLines.push(line); } } } });
  app.decorate('prisma', prisma as never);
  app.decorate('zitadelProvisioning', {} as never);
  await registerAuthPlugin(app);
  await app.register(registerRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await issuer.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  logLines.length = 0;
});

const now = () => Math.floor(Date.now() / 1000);

function me(authorization?: string, extra: { url?: string; headers?: Record<string, string> } = {}) {
  return app.inject({
    method: 'GET',
    url: extra.url ?? '/v1/org-context/me',
    headers: { ...(authorization ? { authorization } : {}), ...(extra.headers ?? {}) },
  });
}

const bearer = async (user: TestUser) => `Bearer ${await issuer.accessToken(user)}`;
const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('GET /v1/org-context/me', () => {
  it("returns the caller's own assembly context and is not cacheable", async () => {
    const response = await me(await bearer(TEST_USERS.assemblyAdminA1));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      orgId: assemblyA1.orgId, concessionId: assemblyA1.concessionId, assemblyId: assemblyA1.assemblyId, scope: 'ASSEMBLY',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns the concession context for a concession-org user', async () => {
    const response = await me(await bearer(TEST_USERS.concessionAdminA));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ orgId: concessionA.orgId, concessionId: concessionA.concessionId, assemblyId: null, scope: 'CONCESSION' });
  });

  it('works for each role in its own assembly', async () => {
    for (const user of [TEST_USERS.fieldAgentA1, TEST_USERS.viewerA2, TEST_USERS.assemblyAdminB1]) {
      const response = await me(await bearer(user));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ orgId: user.homeOrgId });
    }
  });

  it('refuses a verified user with no iDARMS role in their home org (403 no_role)', async () => {
    for (const user of [TEST_USERS.noRoleA1, TEST_USERS.foreignRoleA1]) {
      const response = await me(await bearer(user));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'no_role' });
      expect(response.body).not.toContain(assemblyA1.assemblyId);
    }
    expect(prisma.zitadelOrgContext.findUnique).toHaveBeenCalledTimes(2); // the auth plugin's own read only
  });

  it('returns 404 for a verified user whose org is not registered', async () => {
    const response = await me(await bearer(TEST_USERS.unregistered));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });

  it('returns 404 for an org whose registry row is not ACTIVE', async () => {
    const response = await me(await bearer(inactiveUser));

    expect(response.statusCode).toBe(404);
  });

  it('refuses a verified token with no home organisation claim', async () => {
    const response = await me(await bearer(TEST_USERS.noHomeOrg));

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'home_org_missing' });
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalled();
  });
});

describe('cross-tenant attempts', () => {
  it('ignores an org named in the query string or a dev header', async () => {
    const response = await me(await bearer(TEST_USERS.assemblyAdminA1), {
      url: `/v1/org-context/me?orgId=${assemblyA2.orgId}`,
      headers: { 'x-idarms-org-id': assemblyA2.orgId, 'x-idarms-assembly-id': assemblyA2.assemblyId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ orgId: assemblyA1.orgId, assemblyId: assemblyA1.assemblyId });
    expect(response.body).not.toContain(assemblyA2.orgId);
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalledWith({ where: { orgId: assemblyA2.orgId } });
  });

  it("does not let a user read another org's context by id (the old route is gone)", async () => {
    const response = await me(await bearer(TEST_USERS.assemblyAdminA1), { url: `/v1/org-context/${assemblyA2.orgId}` });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(assemblyA2.assemblyId);
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalledWith({ where: { orgId: assemblyA2.orgId } });
  });

  it('keeps the old by-id path closed without a token', async () => {
    const response = await me(undefined, { url: `/v1/org-context/${assemblyA1.orgId}` });

    expect(response.statusCode).toBe(401);
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalled();
  });

  it('a known org context grants no access to other routes', async () => {
    const auth = await bearer(TEST_USERS.fieldAgentA1);
    expect((await me(auth)).statusCode).toBe(200);

    // A field agent knows its tenant but holds neither concession:read nor directory:read.
    const response = await app.inject({ method: 'GET', url: '/v1/access-directory/assemblies', headers: { authorization: auth } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'forbidden' });
  });
});

describe('token verification', () => {
  const user = TEST_USERS.assemblyAdminA1;
  const rejected: Array<[string, string, () => Promise<string | undefined>]> = [
    ['no Authorization header', 'unauthorized', async () => undefined],
    ['a non-Bearer scheme', 'unauthorized', async () => `Basic ${Buffer.from('user:pass').toString('base64')}`],
    ['a malformed token', 'unauthorized', async () => 'Bearer not-a-jwt'],
    ['a token signed with another key', 'unauthorized', async () => `Bearer ${await issuer.foreignKeyToken(user)}`],
    ['an unknown key id', 'unauthorized', async () => `Bearer ${await issuer.accessToken(user, { kid: 'unknown-kid' })}`],
    ['the wrong issuer', 'unauthorized', async () => `Bearer ${await issuer.accessToken(user, { issuer: 'http://evil.test' })}`],
    ['the wrong audience', 'unauthorized', async () => `Bearer ${await issuer.accessToken(user, { audience: 'other-app' })}`],
    ['an expired token', 'unauthorized', async () => `Bearer ${await issuer.expiredAccessToken(user)}`],
    ['a token not yet valid', 'unauthorized', async () => `Bearer ${await issuer.accessToken(user, { notBefore: now() + 600 })}`],
    ['an unsigned alg=none token', 'unauthorized', async () => {
      const payload = { 'urn:zitadel:iam:user:resourceowner:id': user.homeOrgId, sub: user.subject, iss: 'http://issuer.test', aud: 'idarms-audience', exp: now() + 300, jti: 'j' };
      return `Bearer ${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.`;
    }],
    ['an ID token', 'wrong_token_type', async () => `Bearer ${await issuer.idToken(user)}`],
    ['an access token without jti', 'wrong_token_type', async () => `Bearer ${await issuer.accessToken(user, { claims: { jti: undefined } })}`],
  ];

  it.each(rejected)('returns 401 for %s and never reads the registry', async (_label, error, authorization) => {
    const response = await me(await authorization());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error });
    expect(response.json()).not.toHaveProperty('orgId');
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalled();
  });

  it('never puts the token in a log line or an error body', async () => {
    const bad = await issuer.idToken(user);
    const good = await issuer.accessToken(user);
    const refused = await me(`Bearer ${bad}`);
    await me(`Bearer ${good}`);

    expect(refused.body).not.toContain(bad);
    const logs = logLines.join('\n');
    expect(logs).not.toContain(bad);
    expect(logs).not.toContain(good);
    expect(logs).not.toMatch(/eyJ[\w-]+\.eyJ/);
  });
});
