// Sets up the portal's own login against the local ZITADEL (ADR-0004):
//   1. a machine user `idarms-portal-login` with the instance role IAM_LOGIN_CLIENT,
//      which lets the portal server create sessions and finish OIDC auth requests;
//   2. a JSON machine key for it in .secrets/ (gitignored, never printed);
//   3. the idarms-portal app's login page set to the portal, so no sign-in ever
//      lands on ZITADEL's hosted login screens.
// Idempotent. Run: pnpm zitadel:login-client (the bootstrap also runs it).
import { execSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.env.ZITADEL_URL ?? 'http://localhost:8080';
const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:3000';
const LOGIN_CLIENT_USERNAME = 'idarms-portal-login';
export const LOGIN_CLIENT_KEY_PATH = join(root, '.secrets', 'zitadel-portal-login-client.json');

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signAssertionJwt(machineKey, ttlSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: machineKey.keyId }));
  const payload = b64url(JSON.stringify({
    iss: machineKey.userId, sub: machineKey.userId, aud: BASE, iat: now, exp: now + ttlSeconds,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(machineKey.key))}`;
}

export async function tokenForMachineKey(machineKey) {
  const res = await fetch(`${BASE}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signAssertionJwt(machineKey),
      scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token exchange -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).access_token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

function readAdminKey() {
  const raw = execSync(
    'docker run --rm -v idarms-zitadel_zitadel-bootstrap:/data:ro alpine cat /data/admin-sa.json',
    { encoding: 'utf8' },
  );
  return JSON.parse(raw);
}

async function ensureLoginClientUser(token) {
  const users = (await api(token, 'POST', '/management/v1/users/_search', {
    queries: [{ userNameQuery: { userName: LOGIN_CLIENT_USERNAME, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
  }))?.result ?? [];
  if (users[0]?.id) {
    console.log(`  existing machine user ${LOGIN_CLIENT_USERNAME} (${users[0].id})`);
    return users[0].id;
  }
  const created = await api(token, 'POST', '/management/v1/users/machine', {
    userName: LOGIN_CLIENT_USERNAME,
    name: 'iDARMS portal login',
    description: 'Server-side login client for the iDARMS portal (ADR-0004)',
    accessTokenType: 'ACCESS_TOKEN_TYPE_BEARER',
  });
  console.log(`  created machine user ${LOGIN_CLIENT_USERNAME} (${created.userId})`);
  return created.userId;
}

async function ensureLoginClientRole(token, userId) {
  try {
    await api(token, 'POST', '/admin/v1/members', { userId, roles: ['IAM_LOGIN_CLIENT'] });
    console.log('  granted instance role IAM_LOGIN_CLIENT');
  } catch (error) {
    if (error.status !== 409) throw error;
    await api(token, 'PUT', `/admin/v1/members/${userId}`, { roles: ['IAM_LOGIN_CLIENT'] }).catch((e) => {
      if (!String(e.message).includes('No changes')) throw e;
    });
    console.log('  instance role IAM_LOGIN_CLIENT already present');
  }
}

async function ensureLoginClientKey(token, userId) {
  if (existsSync(LOGIN_CLIENT_KEY_PATH)) {
    const key = JSON.parse(readFileSync(LOGIN_CLIENT_KEY_PATH, 'utf8'));
    if (key.userId === userId) {
      try {
        await tokenForMachineKey(key);
        console.log(`  existing key works (${LOGIN_CLIENT_KEY_PATH})`);
        return;
      } catch {
        console.log('  existing key no longer works; issuing a new one');
      }
    }
  }
  const created = await api(token, 'POST', `/management/v1/users/${userId}/keys`, { type: 'KEY_TYPE_JSON' });
  const keyJson = Buffer.from(created.keyDetails, 'base64').toString('utf8');
  mkdirSync(dirname(LOGIN_CLIENT_KEY_PATH), { recursive: true });
  writeFileSync(LOGIN_CLIENT_KEY_PATH, keyJson, { mode: 0o600 });
  console.log(`  wrote new key to ${LOGIN_CLIENT_KEY_PATH} (contents not printed)`);
}

async function ensurePortalLoginPage(token) {
  const project = ((await api(token, 'POST', '/management/v1/projects/_search', {}))?.result ?? [])
    .find((p) => p.name === 'iDARMS');
  if (!project) throw new Error('iDARMS project not found; run pnpm zitadel:bootstrap first');
  const app = ((await api(token, 'POST', `/management/v1/projects/${project.id}/apps/_search`, {}))?.result ?? [])
    .find((a) => a.name === 'idarms-portal');
  if (!app?.oidcConfig) throw new Error('idarms-portal app not found; run pnpm zitadel:bootstrap first');

  const baseUri = new URL('/', PORTAL_URL).toString();
  if (app.oidcConfig.loginVersion?.loginV2?.baseUri === baseUri) {
    console.log(`  idarms-portal already signs in at ${baseUri}login`);
    return;
  }
  const c = app.oidcConfig;
  await api(token, 'PUT', `/management/v1/projects/${project.id}/apps/${app.id}/oidc_config`, {
    redirectUris: c.redirectUris,
    responseTypes: c.responseTypes,
    grantTypes: c.grantTypes,
    appType: c.appType,
    authMethodType: c.authMethodType,
    postLogoutRedirectUris: c.postLogoutRedirectUris,
    devMode: c.devMode,
    accessTokenType: c.accessTokenType,
    accessTokenRoleAssertion: c.accessTokenRoleAssertion,
    idTokenRoleAssertion: c.idTokenRoleAssertion,
    idTokenUserinfoAssertion: c.idTokenUserinfoAssertion,
    clockSkew: c.clockSkew,
    additionalOrigins: c.additionalOrigins,
    skipNativeAppSuccessPage: c.skipNativeAppSuccessPage,
    backChannelLogoutUri: c.backChannelLogoutUri,
    loginVersion: { loginV2: { baseUri } },
  });
  console.log(`  idarms-portal now signs in at ${baseUri}login`);
}

/** Runs every step with an admin token. Exported so the bootstrap can reuse it. */
export async function ensurePortalLogin(token) {
  const userId = await ensureLoginClientUser(token);
  await ensureLoginClientRole(token, userId);
  await ensureLoginClientKey(token, userId);
  await ensurePortalLoginPage(token);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Portal login client');
  ensurePortalLogin(await tokenForMachineKey(readAdminKey())).catch((error) => {
    console.error(`\nFailed: ${error.message}`);
    process.exit(1);
  });
}
