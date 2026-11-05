import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload, type KeyLike } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// GET /v1/org-context/me through the real ZITADEL verification path: tokens are
// signed with a local key pair served as a JWKS (ADR-0003, finding T5).
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
import { registerRoutes } from '../concessions/routes';

const ISSUER = 'http://issuer.test';
const AUDIENCE = 'idarms-audience';
const KID = 'test-key-1';
const RESOURCE_OWNER = 'urn:zitadel:iam:user:resourceowner:id';
const ROLE_CLAIM = 'urn:zitadel:iam:org:project:roles';
const CONCESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSEMBLY_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSEMBLY_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORG_A = '200000000000000001';
const ORG_B = '200000000000000002';
const ORG_CONCESSION = '200000000000000003';
const ORG_INACTIVE = '200000000000000004';

const rows: Record<string, { orgId: string; concessionId: string; assemblyId: string | null; scope: string; status: string }> = {
  [ORG_A]: { orgId: ORG_A, concessionId: CONCESSION, assemblyId: ASSEMBLY_A, scope: 'ASSEMBLY', status: 'ACTIVE' },
  [ORG_B]: { orgId: ORG_B, concessionId: CONCESSION, assemblyId: ASSEMBLY_B, scope: 'ASSEMBLY', status: 'ACTIVE' },
  [ORG_CONCESSION]: { orgId: ORG_CONCESSION, concessionId: CONCESSION, assemblyId: null, scope: 'CONCESSION', status: 'ACTIVE' },
  [ORG_INACTIVE]: { orgId: ORG_INACTIVE, concessionId: CONCESSION, assemblyId: ASSEMBLY_B, scope: 'ASSEMBLY', status: 'INACTIVE' },
};

const prisma = {
  zitadelOrgContext: {
    findUnique: vi.fn(async ({ where }: { where: { orgId: string } }) => rows[where.orgId] ?? null),
  },
  concessionContract: { findMany: vi.fn(async () => []) },
};

let app: FastifyInstance;
let jwksServer: Server;
let signingKey: KeyLike;
let otherKey: KeyLike;
const logLines: string[] = [];

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  jwksServer = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  const { port } = jwksServer.address() as AddressInfo;
  config.zitadelJwksUri = `http://127.0.0.1:${port}/oauth/v2/keys`;

  app = Fastify({
    logger: { level: 'info', stream: { write: (line: string) => { logLines.push(line); } } },
  });
  app.decorate('prisma', prisma as never);
  app.decorate('zitadelProvisioning', {} as never);
  await registerAuthPlugin(app);
  await app.register(registerRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await new Promise((resolve) => jwksServer.close(resolve));
});

beforeEach(() => {
  vi.clearAllMocks();
  logLines.length = 0;
});

const now = () => Math.floor(Date.now() / 1000);

interface TokenOptions {
  key?: KeyLike;
  kid?: string;
  issuer?: string;
  audience?: string;
  expiresAt?: number;
  notBefore?: number;
  claims?: JWTPayload;
}

function userOf(orgId: string, role = 'ASSEMBLY_VIEWER'): JWTPayload {
  return { [RESOURCE_OWNER]: orgId, [ROLE_CLAIM]: { [role]: { [orgId]: 'org.localhost' } } };
}

async function token(options: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT(options.claims ?? userOf(ORG_A))
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? KID })
    .setSubject('user-1')
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? now() + 300);
  if (options.notBefore) jwt.setNotBefore(options.notBefore);
  return jwt.sign(options.key ?? signingKey);
}

function me(authorization?: string, extra: { url?: string; headers?: Record<string, string> } = {}) {
  return app.inject({
    method: 'GET',
    url: extra.url ?? '/v1/org-context/me',
    headers: { ...(authorization ? { authorization } : {}), ...(extra.headers ?? {}) },
  });
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('GET /v1/org-context/me', () => {
  it("returns the caller's own assembly context and is not cacheable", async () => {
    const response = await me(`Bearer ${await token()}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ orgId: ORG_A, concessionId: CONCESSION, assemblyId: ASSEMBLY_A, scope: 'ASSEMBLY' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns the concession context for a concession-org user', async () => {
    const claims = userOf(ORG_CONCESSION, 'CONCESSION_SUPER_ADMIN');
    const response = await me(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ orgId: ORG_CONCESSION, concessionId: CONCESSION, assemblyId: null, scope: 'CONCESSION' });
  });

  it('answers for the token home org even when the caller has no role', async () => {
    const response = await me(`Bearer ${await token({ claims: { [RESOURCE_OWNER]: ORG_A } })}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ orgId: ORG_A });
  });

  it('returns 404 for a verified user whose org is not registered', async () => {
    const response = await me(`Bearer ${await token({ claims: userOf('299999999999999999') })}`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });

  it('returns 404 for an org whose registry row is not ACTIVE', async () => {
    const response = await me(`Bearer ${await token({ claims: userOf(ORG_INACTIVE) })}`);

    expect(response.statusCode).toBe(404);
  });

  it('refuses a verified token with no home organisation claim', async () => {
    const claims = { [ROLE_CLAIM]: { ASSEMBLY_ADMIN: { [ORG_A]: 'org.localhost' } } };
    const response = await me(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'home_org_missing' });
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalled();
  });
});

describe('cross-tenant attempts', () => {
  it('ignores an org named in the query string or a dev header', async () => {
    const response = await me(`Bearer ${await token()}`, {
      url: `/v1/org-context/me?orgId=${ORG_B}`,
      headers: { 'x-idarms-org-id': ORG_B, 'x-idarms-assembly-id': ASSEMBLY_B },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ orgId: ORG_A, assemblyId: ASSEMBLY_A });
    expect(response.body).not.toContain(ORG_B);
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalledWith({ where: { orgId: ORG_B } });
  });

  it("does not let a user read another org's context by id (the old route is gone)", async () => {
    const response = await me(`Bearer ${await token()}`, { url: `/v1/org-context/${ORG_B}` });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(ASSEMBLY_B);
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalledWith({ where: { orgId: ORG_B } });
  });

  it('keeps the old by-id path closed without a token', async () => {
    const response = await me(undefined, { url: `/v1/org-context/${ORG_A}` });

    expect(response.statusCode).toBe(401);
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalled();
  });

  it('a known org context grants no access to other routes', async () => {
    const bearer = `Bearer ${await token({ claims: { [RESOURCE_OWNER]: ORG_A } })}`;
    expect((await me(bearer)).statusCode).toBe(200);

    const response = await app.inject({ method: 'GET', url: '/v1/contracts', headers: { authorization: bearer } });
    expect(response.statusCode).toBe(403);
    expect(prisma.concessionContract.findMany).not.toHaveBeenCalled();
  });
});

describe('token verification', () => {
  const rejected: Array<[string, () => Promise<string | undefined>]> = [
    ['no Authorization header', async () => undefined],
    ['a non-Bearer scheme', async () => `Basic ${Buffer.from('user:pass').toString('base64')}`],
    ['a malformed token', async () => 'Bearer not-a-jwt'],
    ['a token signed with another key', async () => `Bearer ${await token({ key: otherKey })}`],
    ['an unknown key id', async () => `Bearer ${await token({ kid: 'unknown-kid' })}`],
    ['the wrong issuer', async () => `Bearer ${await token({ issuer: 'http://evil.test' })}`],
    ['the wrong audience', async () => `Bearer ${await token({ audience: 'other-app' })}`],
    ['an expired token', async () => `Bearer ${await token({ expiresAt: now() - 60 })}`],
    ['a token not yet valid', async () => `Bearer ${await token({ notBefore: now() + 600 })}`],
    ['an unsigned alg=none token', async () => {
      const payload = { ...userOf(ORG_A), sub: 'user-1', iss: ISSUER, aud: AUDIENCE, exp: now() + 300 };
      return `Bearer ${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.`;
    }],
  ];

  it.each(rejected)('returns 401 for %s and never reads the registry', async (_label, authorization) => {
    const response = await me(await authorization());

    expect(response.statusCode).toBe(401);
    expect(response.json()).not.toHaveProperty('orgId');
    expect(prisma.zitadelOrgContext.findUnique).not.toHaveBeenCalled();
  });

  it('never puts the token in a log line or an error body', async () => {
    const bad = await token({ audience: 'other-app' });
    const good = await token();
    const refused = await me(`Bearer ${bad}`);
    await me(`Bearer ${good}`);

    expect(refused.body).not.toContain(bad);
    const logs = logLines.join('\n');
    expect(logs).not.toContain(bad);
    expect(logs).not.toContain(good);
    expect(logs).not.toMatch(/eyJ[\w-]+\.eyJ/);
  });
});
