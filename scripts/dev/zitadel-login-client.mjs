// Sets up the portal's own login against the local ZITADEL (ADR-0004, ADR-0003 decision 7):
//   1. a machine user `idarms-login-client` in the iDARMS Concession org with exactly the
//      instance role IAM_LOGIN_CLIENT, which lets the portal server create sessions and
//      finish OIDC auth requests;
//   2. a JSON machine key for it in .secrets/ (gitignored, never printed);
//   3. the idarms-portal app's login page set to the portal, so no sign-in ever
//      lands on ZITADEL's hosted login screens.
// Idempotent. Run: pnpm zitadel:login-client (the bootstrap also runs it).
// It replaces the older `idarms-portal-login` user in ZITADEL's default org (deleted
// 5 Nov 2026, ADR-0003 decision 9).
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { api, ensureMachineIdentity, tokenForMachineKey } from './zitadel-machine-identity.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:3000';
const CONCESSION_ORG_NAME = process.env.IDARMS_CONCESSION_ORG_NAME ?? 'iDARMS Concession';
const LOGIN_CLIENT_USERNAME = 'idarms-login-client';
export const LOGIN_CLIENT_KEY_PATH = join(root, '.secrets', 'zitadel-idarms-login-client.json');

function readAdminKey() {
  const raw = execSync(
    'docker run --rm -v idarms-zitadel_zitadel-bootstrap:/data:ro alpine cat /data/admin-sa.json',
    { encoding: 'utf8' },
  );
  return JSON.parse(raw);
}

async function ensurePortalLoginPage(token, orgId, projectId) {
  const app = ((await api(token, 'POST', `/management/v1/projects/${projectId}/apps/_search`, {}, orgId))?.result ?? [])
    .find((a) => a.name === 'idarms-portal');
  if (!app?.oidcConfig) throw new Error('idarms-portal app not found; run pnpm zitadel:bootstrap first');

  const baseUri = new URL('/', PORTAL_URL).toString();
  if (app.oidcConfig.loginVersion?.loginV2?.baseUri === baseUri) {
    console.log(`  idarms-portal already signs in at ${baseUri}login`);
    return;
  }
  const c = app.oidcConfig;
  await api(token, 'PUT', `/management/v1/projects/${projectId}/apps/${app.id}/oidc_config`, {
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
  }, orgId);
  console.log(`  idarms-portal now signs in at ${baseUri}login`);
}

/** Runs every step with an admin token. `orgId` is the iDARMS Concession org that owns `projectId`. */
export async function ensurePortalLogin(token, { orgId, projectId }) {
  await ensureMachineIdentity(token, {
    orgId,
    userName: LOGIN_CLIENT_USERNAME,
    name: 'iDARMS portal login',
    description: 'Server-side login client for the iDARMS portal (ADR-0004)',
    instanceRole: 'IAM_LOGIN_CLIENT',
    keyPath: LOGIN_CLIENT_KEY_PATH,
  });
  await ensurePortalLoginPage(token, orgId, projectId);
}

async function locateConcessionProject(token) {
  const orgs = (await api(token, 'POST', '/v2/organizations/_search', {
    queries: [{ nameQuery: { name: CONCESSION_ORG_NAME, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
  }))?.result ?? [];
  if (orgs.length !== 1) throw new Error(`expected one org named "${CONCESSION_ORG_NAME}"; run pnpm zitadel:bootstrap first`);
  const orgId = orgs[0].id;
  const project = ((await api(token, 'POST', '/management/v1/projects/_search', {}, orgId))?.result ?? [])
    .find((p) => p.name === 'iDARMS');
  if (!project) throw new Error('iDARMS project not found in the concession org; run pnpm zitadel:bootstrap first');
  return { orgId, projectId: project.id };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Portal login client');
  try {
    const token = await tokenForMachineKey(readAdminKey());
    await ensurePortalLogin(token, await locateConcessionProject(token));
  } catch (error) {
    console.error(`\nFailed: ${error.message}`);
    process.exit(1);
  }
}
