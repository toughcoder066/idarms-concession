// End-to-end check of iDARMS authentication against the real local ZITADEL and
// the running services (ADR-0003 decision 10, ADR-0004). Unit tests use a local
// test issuer; this is the one test that proves the real tokens work.
//
// Needs: ZITADEL up and bootstrapped, concessions-management running with
// AUTH_MODE=zitadel, and as many of the other services as you want checked
// (services that are not running are reported and skipped). A user with at least
// one iDARMS role:
//   IDARMS_IT_LOGIN=ama-active-admin@idarms.local IDARMS_IT_PASSWORD=... pnpm test:auth:integration
// Tokens and the password are never printed.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenForMachineKey } from './zitadel-machine-identity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ZITADEL = process.env.ZITADEL_URL ?? 'http://localhost:8080';
const PORTAL_CALLBACK = process.env.PORTAL_CALLBACK_URL ?? 'http://localhost:3000/api/auth/callback/zitadel';
const CONCESSIONS = process.env.CONCESSIONS_URL ?? 'http://localhost:3100';
const SERVICES = [
  ['property', 'http://localhost:3010/v1/properties'],
  ['ratepayer', 'http://localhost:3020/v1/ratepayers'],
  ['billing', 'http://localhost:3030/v1/bills'],
  ['payment', 'http://localhost:3040/v1/payments'],
  ['documents', 'http://localhost:3050/v1/documents'],
  ['valuation', 'http://localhost:3060/v1/valuations'],
  ['reconciliation', 'http://localhost:3070/v1/discrepancies'],
  ['reporting', 'http://localhost:3080/v1/dashboard/metrics'],
  ['croip-integration', 'http://localhost:3090/v1/assigned-assemblies'],
  ['gis', 'http://localhost:3110/v1/zones'],
];

const loginName = process.env.IDARMS_IT_LOGIN;
const password = process.env.IDARMS_IT_PASSWORD;
if (!loginName || !password) {
  console.error('Set IDARMS_IT_LOGIN and IDARMS_IT_PASSWORD (a local user with an iDARMS role).');
  process.exit(2);
}

const apps = JSON.parse(readFileSync(join(ROOT, '.secrets', 'zitadel-idarms-apps.json'), 'utf8'));
const loginKey = JSON.parse(readFileSync(join(ROOT, '.secrets', 'zitadel-idarms-login-client.json'), 'utf8'));

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

// The portal's own sign-in (ADR-0004): authorize, Session API, finalize, code exchange.
async function signIn() {
  const verifier = randomBytes(32).toString('base64url');
  const authorize = new URL(`${ZITADEL}/oauth/v2/authorize`);
  for (const [key, value] of Object.entries({
    client_id: apps.portal.clientId,
    redirect_uri: PORTAL_CALLBACK,
    response_type: 'code',
    scope: 'openid profile email urn:zitadel:iam:user:resourceowner',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'auth-integration-test',
  })) authorize.searchParams.set(key, value);
  const redirect = await fetch(authorize, { redirect: 'manual' });
  const location = new URL(redirect.headers.get('location') ?? '', ZITADEL);
  const authRequestId = location.searchParams.get('authRequest') ?? location.searchParams.get('authRequestId');
  if (!authRequestId) throw new Error(`authorize did not return an auth request (${redirect.status})`);

  const login = await tokenForMachineKey(loginKey);
  const zitadel = async (method, path, body) => {
    const response = await fetch(ZITADEL + path, {
      method,
      headers: { authorization: `Bearer ${login}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
    return response.json();
  };
  const session = await zitadel('POST', '/v2/sessions', { checks: { user: { loginName }, password: { password } } });
  const { callbackUrl } = await zitadel('POST', `/v2/oidc/auth_requests/${authRequestId}`, {
    session: { sessionId: session.sessionId, sessionToken: session.sessionToken },
  });
  const tokens = await fetch(`${ZITADEL}/oauth/v2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${apps.portal.clientId}:${apps.portal.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: new URL(callbackUrl).searchParams.get('code'),
      redirect_uri: PORTAL_CALLBACK,
      code_verifier: verifier,
    }),
  });
  if (!tokens.ok) throw new Error(`code exchange -> ${tokens.status}`);
  return { ...(await tokens.json()), session };
}

async function call(url, token) {
  try {
    const response = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, json, text };
  } catch {
    return { status: 0 };
  }
}

const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
const leaks = (text, tokens) => tokens.some((token) => text?.includes(token));

const { access_token: access, id_token: idToken } = await signIn();
const accessClaims = claims(access);
const homeOrg = accessClaims['urn:zitadel:iam:user:resourceowner:id'];
const all = [access, idToken];

console.log('ZITADEL tokens');
check('access token is a JWT with a jti', access.split('.').length === 3 && typeof accessClaims.jti === 'string');
check('access token audience includes the portal client id', [].concat(accessClaims.aud).includes(apps.portal.clientId));
check('access token carries the home org', typeof homeOrg === 'string' && homeOrg !== '');
check('ID token has no jti', !('jti' in claims(idToken)));

console.log('\nconcessions-management /v1/org-context/me');
const me = await call(`${CONCESSIONS}/v1/org-context/me`, access);
check('access token gets its own org context', me.status === 200 && me.json?.orgId === homeOrg, `status ${me.status}`);
for (const [label, token, expected] of [
  ['no token', undefined, 'unauthorized'],
  ['garbage token', 'not-a-jwt', 'unauthorized'],
  ['tampered signature', `${access.slice(0, -6)}AAAAAA`, 'unauthorized'],
  ['ID token', idToken, 'wrong_token_type'],
]) {
  const response = await call(`${CONCESSIONS}/v1/org-context/me`, token);
  check(`${label} is refused`, response.status === 401 && response.json?.error === expected, `status ${response.status} ${response.json?.error ?? ''}`);
  check(`${label}: no token in the response`, !leaks(response.text, all));
}
const byId = await call(`${CONCESSIONS}/v1/org-context/${homeOrg}`, access);
check('the old by-id route no longer exists', byId.status === 404 && !byId.json?.concessionId, `status ${byId.status}`);

console.log('\nservices');
for (const [name, url] of SERVICES) {
  const withAccess = await call(url, access);
  if (withAccess.status === 0) {
    console.log(`SKIP  ${name}: not running`);
    continue;
  }
  check(`${name} accepts the access token`, withAccess.status !== 401, `status ${withAccess.status}`);
  const withId = await call(url, idToken);
  check(`${name} refuses the ID token`, withId.status === 401 && withId.json?.error === 'wrong_token_type', `status ${withId.status}`);
  check(`${name}: no token in the response`, !leaks(withAccess.text, all) && !leaks(withId.text, all));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
