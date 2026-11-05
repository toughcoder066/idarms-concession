import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload, type KeyLike } from 'jose';
import type { TestUser } from './personas';

/**
 * A stand-in for ZITADEL in automated tests: a local RSA key pair whose public
 * half is served as a JWKS on 127.0.0.1, and helpers that sign tokens shaped like
 * the ones ZITADEL issues to the portal. Tests run the service's real
 * verification against it, so no live ZITADEL is needed. The keys exist only
 * for the life of the test process.
 *
 * Config is read at import, so set these first (for example in vi.hoisted):
 *   AUTH_MODE=zitadel, ZITADEL_ISSUER=TEST_ISSUER, ZITADEL_AUDIENCE=TEST_AUDIENCE,
 *   ZITADEL_PROJECT_ID=TEST_PROJECT_ID, ZITADEL_JWKS_URI=<any URL>,
 * then point config.zitadelJwksUri at issuer.jwksUri before building the app.
 */
export const TEST_ISSUER = 'http://issuer.test';
export const TEST_AUDIENCE = 'idarms-audience';
export const TEST_PROJECT_ID = '111111111111111111';

const RESOURCE_OWNER = 'urn:zitadel:iam:user:resourceowner:id';
const ROLE_CLAIM = 'urn:zitadel:iam:org:project:roles';
const KID = 'test-key-1';

export interface TokenOverrides {
  issuer?: string;
  audience?: string;
  /** Seconds since the epoch. */
  expiresAt?: number;
  notBefore?: number;
  kid?: string;
  /** Extra or replacement claims, applied last. */
  claims?: JWTPayload;
}

export interface TestIssuer {
  readonly jwksUri: string;
  /** What ZITADEL issues the portal as an access token: has `jti`, no ID-token claims. */
  accessToken(user: TestUser, overrides?: TokenOverrides): Promise<string>;
  /** What ZITADEL issues the portal as an ID token: same issuer and audience, never a bearer token. */
  idToken(user: TestUser, overrides?: TokenOverrides): Promise<string>;
  /** An access token that expired a minute ago. */
  expiredAccessToken(user: TestUser): Promise<string>;
  /** An access token signed with a key the JWKS does not publish. */
  foreignKeyToken(user: TestUser): Promise<string>;
  close(): Promise<void>;
}

const now = () => Math.floor(Date.now() / 1000);

/** The ZITADEL claims for a test user: home org and organisation-bound role grants. */
export function userClaims(user: TestUser): JWTPayload {
  const roles: Record<string, Record<string, string>> = {};
  for (const [role, orgIds] of Object.entries(user.roles ?? {})) {
    roles[role] = Object.fromEntries(orgIds.map((orgId) => [orgId, `${orgId}.localhost`]));
  }
  return {
    ...(user.homeOrgId ? { [RESOURCE_OWNER]: user.homeOrgId } : {}),
    ...(Object.keys(roles).length > 0 ? { [ROLE_CLAIM]: roles } : {}),
  };
}

async function sign(key: KeyLike, user: TestUser, extra: JWTPayload, overrides: TokenOverrides): Promise<string> {
  const jwt = new SignJWT({ ...userClaims(user), ...extra, ...(overrides.claims ?? {}) })
    .setProtectedHeader({ alg: 'RS256', kid: overrides.kid ?? KID, typ: 'JWT' })
    .setSubject(user.subject)
    .setIssuer(overrides.issuer ?? TEST_ISSUER)
    .setAudience(overrides.audience ?? [TEST_AUDIENCE, TEST_PROJECT_ID])
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? now() + 300);
  if (overrides.notBefore !== undefined) jwt.setNotBefore(overrides.notBefore);
  return jwt.sign(key);
}

export async function startTestIssuer(): Promise<TestIssuer> {
  const pair = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };

  const server: Server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const access = (user: TestUser, overrides: TokenOverrides = {}, key = pair.privateKey) =>
    sign(key, user, { jti: randomUUID(), client_id: TEST_AUDIENCE, nbf: now() }, overrides);

  return {
    jwksUri: `http://127.0.0.1:${port}/oauth/v2/keys`,
    accessToken: (user, overrides) => access(user, overrides),
    idToken: (user, overrides = {}) => sign(pair.privateKey, user, {
      azp: TEST_AUDIENCE,
      client_id: TEST_AUDIENCE,
      at_hash: 'test-at-hash',
      amr: ['password', 'pwd'],
      auth_time: now(),
      sid: randomUUID(),
    }, overrides),
    expiredAccessToken: (user) => access(user, { expiresAt: now() - 60 }),
    foreignKeyToken: (user) => access(user, {}, foreign.privateKey),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
