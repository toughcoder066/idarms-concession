import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload, type KeyLike } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The real ZITADEL path: tokens are signed with a local key pair whose public
// half is served as a JWKS. Config is read at import, so set it first.
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
vi.mock('../lib/org-context', () => ({
  resolveOrgContext: vi.fn(async (orgId: string) => {
    if (orgId === ORG_A) return { orgId, concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A, scope: 'ASSEMBLY' };
    if (orgId === ORG_B) return { orgId, concessionId: CONCESSION_A, assemblyId: ASSEMBLY_B, scope: 'ASSEMBLY' };
    if (orgId === ORG_PORTFOLIO) return { orgId, concessionId: CONCESSION_A, assemblyId: null, scope: 'PORTFOLIO' };
    return null;
  }),
}));

import { config } from '../config';
import { registerRoutes } from '../modules/ratepayers/routes';
import { registerAuthPlugin } from './auth';

const ISSUER = 'http://issuer.test';
const AUDIENCE = 'idarms-audience';
const KID = 'test-key-1';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ORG_PORTFOLIO = 'org-portfolio';
const OUR_PROJECT = '111111111111111111';
const ASSEMBLY_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RESOURCE_OWNER = 'urn:zitadel:iam:user:resourceowner:id';
const CONCESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSEMBLY_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROLE_CLAIM = 'urn:zitadel:iam:org:project:roles';

const prisma = {
  ratepayer: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
  },
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
    logger: { level: 'warn', stream: { write: (line: string) => { logLines.push(line); } } },
  });
  await registerAuthPlugin(app);
  app.decorate('prisma', prisma as never);
  app.get('/health/live', async () => ({ status: 'ok' }));
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

interface TokenOptions {
  key?: KeyLike;
  kid?: string;
  issuer?: string;
  audience?: string;
  expiresAt?: number;
  notBefore?: number;
  claims?: JWTPayload;
}

const now = () => Math.floor(Date.now() / 1000);

const viewerOfOrgA: JWTPayload = {
  'urn:zitadel:iam:user:resourceowner:id': ORG_A,
  [ROLE_CLAIM]: { ASSEMBLY_VIEWER: { [ORG_A]: 'assembly-a.localhost' } },
};

async function token(options: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT(options.claims ?? viewerOfOrgA)
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? KID })
    .setSubject('user-1')
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? now() + 300);
  if (options.notBefore) jwt.setNotBefore(options.notBefore);
  return jwt.sign(options.key ?? signingKey);
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function list(authorization?: string) {
  return app.inject({
    method: 'GET',
    url: '/v1/ratepayers',
    headers: authorization ? { authorization } : {},
  });
}

describe('ZITADEL token verification', () => {
  it('accepts a valid token and scopes the query to the resolved tenant', async () => {
    const response = await list(`Bearer ${await token()}`);

    expect(response.statusCode).toBe(200);
    expect(prisma.ratepayer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A }),
    }));
  });

  it('ignores dev identity headers when a valid token is present', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ratepayers',
      headers: {
        authorization: `Bearer ${await token()}`,
        'x-idarms-concession-id': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'x-idarms-assembly-id': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.ratepayer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A }),
    }));
  });

  it('refuses dev identity headers without a token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ratepayers',
      headers: {
        'x-idarms-concession-id': CONCESSION_A,
        'x-idarms-assembly-id': ASSEMBLY_A,
        'x-idarms-permissions': 'ratepayer:read',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

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
      const payload = { ...viewerOfOrgA, sub: 'user-1', iss: ISSUER, aud: AUDIENCE, exp: now() + 300 };
      return `Bearer ${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.`;
    }],
    ['an HS256 token', async () => {
      const secret = new TextEncoder().encode('a-shared-secret-of-sufficient-length!!');
      const jwt = await new SignJWT(viewerOfOrgA)
        .setProtectedHeader({ alg: 'HS256', kid: KID })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime(now() + 300)
        .sign(secret);
      return `Bearer ${jwt}`;
    }],
  ];

  it.each(rejected)('returns 401 for %s and never queries', async (_label, authorization) => {
    const response = await list(await authorization());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthorized' });
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

  it('refuses a valid token whose organisation has no iDARMS context', async () => {
    const claims = {
      'urn:zitadel:iam:user:resourceowner:id': 'org-unknown',
      [ROLE_CLAIM]: { ASSEMBLY_VIEWER: { 'org-unknown': 'unknown.localhost' } },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'tenant_unresolved' });
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

  it('refuses a valid token without the required permission', async () => {
    const claims = { 'urn:zitadel:iam:user:resourceowner:id': ORG_A };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'forbidden' });
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

  it('serves public health paths without a token', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
  });
});

describe('permissions follow the home organisation', () => {
  it('ignores a role granted only in another organisation', async () => {
    const claims = {
      [RESOURCE_OWNER]: ORG_A,
      [ROLE_CLAIM]: { ASSEMBLY_VIEWER: { [ORG_B]: 'assembly-b.localhost' } },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'forbidden' });
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

  it('uses only the home organisation roles when several organisations grant roles', async () => {
    const claims = {
      [RESOURCE_OWNER]: ORG_A,
      [ROLE_CLAIM]: {
        ASSEMBLY_VIEWER: { [ORG_A]: 'assembly-a.localhost' },
        ASSEMBLY_ADMIN: { [ORG_B]: 'assembly-b.localhost' },
      },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(200);
    expect(prisma.ratepayer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A }),
    }));
  });

  it('ignores the raw urn:idarms:permissions claim', async () => {
    const claims = { [RESOURCE_OWNER]: ORG_A, 'urn:idarms:permissions': ['ratepayer:read'] };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(403);
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

  it('ignores a role claim from another ZITADEL project', async () => {
    const claims = {
      [RESOURCE_OWNER]: ORG_A,
      'urn:zitadel:iam:org:project:999999999999999999:roles': {
        ASSEMBLY_VIEWER: { [ORG_A]: 'assembly-a.localhost' },
      },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(403);
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });

  it('accepts the role claim named for the iDARMS project', async () => {
    const claims = {
      [RESOURCE_OWNER]: ORG_A,
      [`urn:zitadel:iam:org:project:${OUR_PROJECT}:roles`]: {
        ASSEMBLY_VIEWER: { [ORG_A]: 'assembly-a.localhost' },
      },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(200);
  });

  it('lets the super admin read concession-wide with the grant on the portfolio organisation', async () => {
    const claims = {
      [RESOURCE_OWNER]: ORG_PORTFOLIO,
      [ROLE_CLAIM]: {
        CONCESSION_SUPER_ADMIN: { [ORG_PORTFOLIO]: 'portfolio.localhost', [ORG_A]: 'assembly-a.localhost' },
      },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(200);
    const [{ where }] = prisma.ratepayer.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ concessionId: CONCESSION_A });
    expect(where).not.toHaveProperty('assemblyId');
  });

  it('refuses a portfolio user whose super admin grant is only on assembly organisations', async () => {
    const claims = {
      [RESOURCE_OWNER]: ORG_PORTFOLIO,
      [ROLE_CLAIM]: { CONCESSION_SUPER_ADMIN: { [ORG_A]: 'assembly-a.localhost' } },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(403);
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });
});

describe('home organisation claim', () => {
  it('refuses a token without it instead of guessing from role grants, and logs why', async () => {
    const claims = {
      [ROLE_CLAIM]: { ASSEMBLY_ADMIN: { [ORG_A]: 'assembly-a.localhost' } },
    };
    const response = await list(`Bearer ${await token({ claims })}`);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'home_org_missing' });
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();

    const entry = logLines.map((line) => JSON.parse(line)).find((log) => log.missingClaim === RESOURCE_OWNER);
    expect(entry).toMatchObject({ level: 40, subject: 'user-1', missingClaim: RESOURCE_OWNER });
    expect(entry.msg).toMatch(/no home organisation claim/);
    expect(entry.claimsPresent).toContain(ROLE_CLAIM);
    expect(JSON.stringify(logLines)).not.toMatch(/eyJ/);
  });

  it('refuses an empty home organisation claim', async () => {
    const response = await list(`Bearer ${await token({ claims: { ...viewerOfOrgA, [RESOURCE_OWNER]: '' } })}`);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'home_org_missing' });
  });
});
