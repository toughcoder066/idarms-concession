// Config-as-code bootstrap for the local iDARMS ZITADEL instance.
// Creates the iDARMS project, API + web apps, the canonical human/machine
// project roles, the dedicated concession organisation, its users and user
// grants, and registers that organisation in the iDARMS org registry. It also
// retires the obsolete flat permission roles and the legacy idarmsContext action.
//
// Organisations (ADR-0003):
//   - ZITADEL's default org is identity infrastructure: it owns the project,
//     apps and machine users. It is never an iDARMS tenant and holds no iDARMS staff.
//   - The concession org (CONCESSION scope, no assembly) is the home org of
//     concession-wide users such as the Concession Super Admin.
//   - Assembly orgs (ASSEMBLY scope) are created by assembly onboarding, not here.
//
// The role/capability model lives in packages/contracts/src/roles.ts. This
// script reads the compiled model so the bootstrap and application code cannot
// drift apart.
//
// Prereqs: the ZITADEL stack is up (pnpm zitadel:up). Run: pnpm zitadel:bootstrap

import { execSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePortalLogin, LOGIN_CLIENT_KEY_PATH } from './zitadel-login-client.mjs';

const require = createRequire(import.meta.url);
const { ROLE_DEFINITIONS, PROJECT_ROLE_KEYS, HUMAN_ROLE_KEYS } = require('../../packages/contracts/dist/roles.js');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const BASE = process.env.ZITADEL_URL ?? 'http://localhost:8080';
const PROJECT_NAME = 'iDARMS';
// The dedicated iDARMS concession organisation. Found by name, created once.
const CONCESSION_ORG_NAME = process.env.IDARMS_CONCESSION_ORG_NAME ?? 'iDARMS Concession';
const MACHINE_USER_ROLE = 'CROIP_M2M';
const PORTAL_URLS = [...new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.PORTAL_URL,
].filter(Boolean))];
const POST_LOGOUT_REDIRECT_URIS = PORTAL_URLS.map((url) => new URL('/signed-out', url).toString());
const LOGIN_BRANDING = {
  primaryColor: '#0f766e',
  warnColor: '#d85b63',
  backgroundColor: '#f5f7fb',
  fontColor: '#172033',
  primaryColorDark: '#14b8a6',
  warnColorDark: '#f87171',
  backgroundColorDark: '#101827',
  fontColorDark: '#f8fafc',
  themeMode: 'THEME_MODE_AUTO',
};

// Concession-wide test users, created in the concession org. Assembly staff
// (field agents and the rest) are invited into their assembly org instead.
const CONCESSION_USERS = [
  {
    userName: 'concession-admin',
    givenName: 'Concession',
    familyName: 'Admin',
    email: 'concession-admin@idarms.local',
    roles: ['CONCESSION_SUPER_ADMIN'],
  },
];

function readMachineKey() {
  // The API container is distroless (no `cat`); read the bootstrap volume with a
  // helper container. Volume name = <compose project>_zitadel-bootstrap.
  const raw = execSync(
    'docker run --rm -v idarms-zitadel_zitadel-bootstrap:/data:ro alpine cat /data/admin-sa.json',
    { encoding: 'utf8' },
  );
  return JSON.parse(raw);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * The first-instance machine key is an RSA JSON key. The ZITADEL Go SDK uses it
 * in the OIDC "JWT Profile" flow: sign an assertion JWT, exchange it at the
 * token endpoint, then use the returned access token.
 */
function signAssertionJwt(machineKey, ttlSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: machineKey.keyId }));
  const payload = b64url(
    JSON.stringify({ iss: machineKey.userId, sub: machineKey.userId, aud: BASE, iat: now, exp: now + ttlSeconds }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(machineKey.key))}`;
}

async function obtainManagementToken(machineKey) {
  const assertion = signAssertionJwt(machineKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
    scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud',
  });
  const res = await fetch(`${BASE}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`token exchange -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text).access_token;
}

async function api(token, method, path, body, orgId) {
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (orgId) headers['x-zitadel-orgid'] = orgId;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

function makeList(pathTemplate) {
  return async (token, projectId, orgId) => {
    const path = pathTemplate.replace('{project_id}', projectId ?? '');
    const res = await api(token, 'POST', path, {}, orgId);
    return res?.result ?? [];
  };
}

const listProjects = makeList('/management/v1/projects/_search');
const listRoles = makeList('/management/v1/projects/{project_id}/roles/_search');
const listApps = makeList('/management/v1/projects/{project_id}/apps/_search');
const listUsers = makeList('/management/v1/users/_search');
const listActions = makeList('/management/v1/actions/_search');
const listGrants = makeList('/management/v1/users/grants/_search');

async function syncLoginBranding(token, orgId) {
  const current = await api(token, 'GET', '/management/v1/policies/label', undefined, orgId);
  const policy = current?.policy;
  const hasCustomPolicy = policy && !policy.isDefault;
  const changed = Object.entries(LOGIN_BRANDING).some(([key, value]) => policy?.[key] !== value);
  if (hasCustomPolicy && !changed) {
    console.log('  iDARMS login colors are already active');
    return;
  }

  await api(token, hasCustomPolicy ? 'PUT' : 'POST', '/management/v1/policies/label', LOGIN_BRANDING, orgId);
  await api(token, 'POST', '/management/v1/policies/label/_activate', {}, orgId);
  console.log('  applied iDARMS login colors to the organization');
}

async function syncUserGrant(token, userId, projectId, roleKeys, orgId) {
  const grants = await listGrants(token, null, orgId);
  const existing = grants.find((grant) => grant.userId === userId && grant.projectId === projectId);
  const next = [...roleKeys].sort();

  if (!existing) {
    if (next.length === 0) return;
    await api(token, 'POST', `/management/v1/users/${userId}/grants`, {
      userId,
      projectId,
      roleKeys: next,
    }, orgId);
    return;
  }

  const current = [...(existing.roleKeys ?? [])].sort();
  if (JSON.stringify(current) === JSON.stringify(next)) return;

  if (next.length === 0) {
    await api(token, 'DELETE', `/management/v1/users/${userId}/grants/${existing.id}`, undefined, orgId);
    return;
  }

  await api(token, 'PUT', `/management/v1/users/${userId}/grants/${existing.id}`, {
    roleKeys: next,
  }, orgId);
}

async function main() {
  console.log('Reading first-instance admin machine key…');
  const machineKey = readMachineKey();
  console.log(`  machine user: ${machineKey.userId}`);

  console.log('Exchanging machine key for a management access token (JWT profile)…');
  const token = await obtainManagementToken(machineKey);
  console.log('  management token acquired');

  console.log('\n0. Infrastructure org (ZITADEL default org; never an iDARMS tenant)');
  const myOrg = await api(token, 'GET', '/management/v1/orgs/me');
  // orgId is this infrastructure org: it owns the project, apps and machine users.
  const orgId = myOrg?.org?.id;
  if (typeof orgId !== 'string' || !orgId) {
    throw new Error('ZITADEL did not return the organization ID required to configure login branding.');
  }
  console.log(`  org id: ${orgId}`);

  console.log('\n0.1 Login branding');
  await syncLoginBranding(token, orgId);

  console.log('\n1. Project');
  let project = (await listProjects(token)).find((p) => p.name === PROJECT_NAME);
  if (project) {
    console.log(`  existing project ${project.id}`);
    // Ensure the project-level role assertion flag is enabled; without it ZITADEL
    // never emits the urn:zitadel:iam:org:project:*:roles claim in tokens.
    await api(token, 'PUT', `/management/v1/projects/${project.id}`, {
      name: PROJECT_NAME,
      projectRoleAssertion: true,
      privateLabelingSetting: 'PRIVATE_LABELING_SETTING_ENFORCE_PROJECT_RESOURCE_OWNER_POLICY',
    });
    console.log('  enabled project role assertion and enforced organization branding');
  } else {
    project = await api(token, 'POST', '/management/v1/projects', {
      name: PROJECT_NAME,
      projectRoleAssertion: true,
      privateLabelingSetting: 'PRIVATE_LABELING_SETTING_ENFORCE_PROJECT_RESOURCE_OWNER_POLICY',
    });
    console.log(`  created project ${project.id}`);
  }
  const projectId = project.id;

  console.log('\n2. OIDC apps');
  const apps = await listApps(token, projectId);
  let apiApp = apps.find((a) => a.name === 'idarms-api');
  let webApp = apps.find((a) => a.name === 'idarms-portal');

  if (!apiApp) {
    const created = await api(token, 'POST', `/management/v1/projects/${projectId}/apps/api`, {
      name: 'idarms-api',
      authMethodType: 'API_AUTH_METHOD_TYPE_BASIC',
    });
    apiApp = { id: created.appId, clientId: created.clientId, clientSecret: created.clientSecret };
    console.log(`  created API app ${created.appId} (client ${created.clientId})`);
  } else {
    apiApp = { id: apiApp.id, clientId: apiApp.apiConfig?.clientId, clientSecret: undefined };
    console.log(`  existing API app ${apiApp.id} (client ${apiApp.clientId ?? '?'})`);
  }

  if (!webApp) {
    const created = await api(token, 'POST', `/management/v1/projects/${projectId}/apps/oidc`, {
      name: 'idarms-portal',
      appType: 'OIDC_APP_TYPE_WEB',
      authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
      grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'OIDC_GRANT_TYPE_REFRESH_TOKEN'],
      responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
      redirectUris: [
        'http://localhost:3000/api/auth/callback/zitadel',
        'http://127.0.0.1:3000/api/auth/callback/zitadel',
      ],
      postLogoutRedirectUris: POST_LOGOUT_REDIRECT_URIS,
      version: 'OIDC_VERSION_1_0',
      accessTokenType: 'OIDC_TOKEN_TYPE_JWT',
      accessTokenRoleAssertion: true,
      idTokenRoleAssertion: true,
      clockSkew: '0s',
      devMode: true,
    });
    webApp = { id: created.appId, clientId: created.clientId, clientSecret: created.clientSecret };
    console.log(`  created web app ${created.appId} (client ${created.clientId})`);
  } else {
    webApp = { id: webApp.id, clientId: webApp.oidcConfig?.clientId, clientSecret: undefined };
    console.log(`  existing web app ${webApp.id} (client ${webApp.clientId ?? '?'})`);
  }

  const oidcConfig = (await listApps(token, projectId))
    .find((app) => app.id === webApp.id)?.oidcConfig;
  if (oidcConfig) {
    const postLogoutRedirectUris = [...new Set([
      ...(oidcConfig.postLogoutRedirectUris ?? []),
      ...POST_LOGOUT_REDIRECT_URIS,
    ])];
    if (postLogoutRedirectUris.length !== (oidcConfig.postLogoutRedirectUris ?? []).length) {
      await api(token, 'PUT', `/management/v1/projects/${projectId}/apps/${webApp.id}/oidc_config`, {
        projectId,
        appId: webApp.id,
        redirectUris: oidcConfig.redirectUris ?? [
          'http://localhost:3000/api/auth/callback/zitadel',
          'http://127.0.0.1:3000/api/auth/callback/zitadel',
        ],
        responseTypes: oidcConfig.responseTypes ?? ['OIDC_RESPONSE_TYPE_CODE'],
        grantTypes: oidcConfig.grantTypes ?? [
          'OIDC_GRANT_TYPE_AUTHORIZATION_CODE',
          'OIDC_GRANT_TYPE_REFRESH_TOKEN',
        ],
        appType: oidcConfig.appType ?? 'OIDC_APP_TYPE_WEB',
        authMethodType: oidcConfig.authMethodType ?? 'OIDC_AUTH_METHOD_TYPE_BASIC',
        postLogoutRedirectUris,
        devMode: oidcConfig.devMode ?? true,
        accessTokenType: oidcConfig.accessTokenType ?? 'OIDC_TOKEN_TYPE_JWT',
        accessTokenRoleAssertion: oidcConfig.accessTokenRoleAssertion ?? true,
        idTokenRoleAssertion: oidcConfig.idTokenRoleAssertion ?? true,
        idTokenUserinfoAssertion: oidcConfig.idTokenUserinfoAssertion ?? false,
        clockSkew: oidcConfig.clockSkew ?? '0s',
      });
      console.log('  registered portal signed-out page for ZITADEL logout');
    } else {
      console.log('  portal signed-out page is already registered for ZITADEL logout');
    }
  } else {
    throw new Error(`ZITADEL did not return OIDC configuration for portal app ${webApp.id}`);
  }

  console.log('\n3. Canonical roles');
  const existingRoles = await listRoles(token, projectId);
  const existingRoleKeys = new Set(existingRoles.map((role) => role.key));
  for (const definition of ROLE_DEFINITIONS) {
    if (!existingRoleKeys.has(definition.key)) {
      await api(token, 'POST', `/management/v1/projects/${projectId}/roles`, {
        roleKey: definition.key,
        displayName: definition.displayName,
        group: definition.group,
      });
      console.log(`  created role ${definition.key}`);
    } else {
      await api(token, 'PUT', `/management/v1/projects/${projectId}/roles/${encodeURIComponent(definition.key)}`, {
        roleKey: definition.key,
        displayName: definition.displayName,
        group: definition.group,
      });
      console.log(`  updated role ${definition.key}`);
    }
  }
  console.log(`  ${ROLE_DEFINITIONS.length} canonical roles present`);

  console.log('\n3.1 Concession organisation');
  const concessionOrgId = await ensureConcessionOrg(token, orgId);
  await ensureConcessionProjectGrant(token, projectId, orgId, concessionOrgId);

  console.log('\n4. Concession users and grants');
  const infraUsers = await listUsers(token, null, orgId);
  const concessionUsers = await listUsers(token, null, concessionOrgId);
  for (const spec of CONCESSION_USERS) {
    let user = concessionUsers.find((u) => u.userName === spec.userName);
    // Repair users created by an older bootstrap version that used the wrong
    // `password` field (they end up stuck in USER_STATE_INITIAL and cannot log in).
    if (user && user.state === 'USER_STATE_INITIAL') {
      await api(token, 'DELETE', `/management/v1/users/${user.id}`, undefined, concessionOrgId);
      console.log(`  removed uninitialized user ${spec.userName}, will recreate`);
      user = null;
    }
    // Older bootstraps created this user in the infrastructure org. ZITADEL cannot
    // move a user between orgs and user names are unique on this instance, so the
    // old local test user is deleted and recreated in the concession org.
    const misplaced = infraUsers.find((u) => u.userName === spec.userName);
    if (misplaced && !user) {
      await api(token, 'DELETE', `/management/v1/users/${misplaced.id}`, undefined, orgId);
      console.log(`  deleted ${spec.userName} from the infrastructure org (${misplaced.id}); recreating it in the concession org`);
    }
    if (!user) {
      user = await api(token, 'POST', '/management/v1/users/human', {
        userName: spec.userName,
        profile: { firstName: spec.givenName, lastName: spec.familyName },
        email: { email: spec.email, isEmailVerified: true },
        initialPassword: 'Password1!',
      }, concessionOrgId);
      console.log(`  created user ${spec.userName} (${user.userId}) in the concession org`);
    } else {
      console.log(`  existing user ${spec.userName} (${user.id}) in the concession org`);
    }
    const userId = user.userId ?? user.id;

    for (const key of ['concessionId', 'assemblyId', 'scope_level', 'assembly_ids']) {
      try {
        await api(token, 'DELETE', `/management/v1/users/${userId}/metadata/${key}`, undefined, concessionOrgId);
      } catch {
        // Metadata may not exist on a fresh user.
      }
    }

    await syncUserGrant(token, userId, projectId, spec.roles, concessionOrgId);
    console.log(`  synced grant for ${spec.userName}: ${spec.roles.join(', ') || '(none)'}`);
    if (spec.roles.includes('CONCESSION_SUPER_ADMIN')) {
      await grantSuperAdminInAssemblyOrgs(token, projectId, orgId, concessionOrgId, userId, spec.userName);
    }
  }

  console.log('\n4.1 No iDARMS roles for people in the infrastructure org');
  const infraHumans = new Set((await listUsers(token, null, orgId)).filter((u) => u.human).map((u) => u.id));
  for (const grant of await listGrants(token, null, orgId)) {
    if (grant.projectId !== projectId || !infraHumans.has(grant.userId)) continue;
    await api(token, 'DELETE', `/management/v1/users/${grant.userId}/grants/${grant.id}`, undefined, orgId);
    console.log(`  removed iDARMS grant from ${grant.userName ?? grant.userId} (infrastructure org)`);
  }

  console.log('\n5. Remove legacy idarmsContext action');
  const legacyAction = (await listActions(token, null, orgId)).find((a) => a.name === 'idarmsContext');
  if (legacyAction) {
    try {
      await api(token, 'POST', '/management/v1/flows/2/trigger/5', { actionIds: [] }, orgId);
      console.log('  cleared idarmsContext flow binding');
    } catch (err) {
      console.log(`  could not clear flow binding: ${err.message}`);
    }
    try {
      await api(token, 'DELETE', `/management/v1/actions/${legacyAction.id}`, undefined, orgId);
      console.log(`  deleted action ${legacyAction.id}`);
    } catch (err) {
      console.log(`  could not delete action ${legacyAction.id}: ${err.message}`);
    }
  } else {
    console.log('  no legacy action present');
  }

  console.log('\n6. M2M machine user (CROIP-issued credentials stand-in)');
  let m2mUser = (await listUsers(token)).find((u) => u.userName === 'croip-m2m');
  let m2mSecret = null;
  if (!m2mUser) {
    m2mUser = await api(token, 'POST', '/management/v1/users/machine', {
      userName: 'croip-m2m',
      name: 'CROIP M2M Client',
      description: 'Stand-in for the client credentials CROIP issues to this concession terminal',
      accessTokenType: 'ACCESS_TOKEN_TYPE_JWT',
    });
    console.log(`  created machine user croip-m2m (${m2mUser.userId})`);
    m2mSecret = await api(token, 'PUT', `/management/v1/users/${m2mUser.userId}/secret`, {});
    console.log(`  client id ${m2mSecret.clientId}`);
  } else {
    console.log(`  existing machine user croip-m2m (${m2mUser.id}) — secret unchanged from first run`);
  }
  const m2mUserId = m2mUser.userId ?? m2mUser.id;

  for (const key of ['concessionId', 'assemblyId', 'scope_level', 'assembly_ids']) {
    try {
      await api(token, 'DELETE', `/management/v1/users/${m2mUserId}/metadata/${key}`, undefined, orgId);
    } catch {
      // Metadata may not exist on a fresh machine user.
    }
  }
  await syncUserGrant(token, m2mUserId, projectId, [MACHINE_USER_ROLE], orgId);
  console.log(`  synced grant for croip-m2m: ${MACHINE_USER_ROLE}`);

  console.log('\n7. Retire obsolete roles');
  const grants = await listGrants(token, null, orgId);
  for (const grant of grants) {
    if (grant.projectId !== projectId) continue;
    const filtered = (grant.roleKeys ?? []).filter((key) => PROJECT_ROLE_KEYS.includes(key));
    if (filtered.length === (grant.roleKeys ?? []).length) continue;
    if (filtered.length === 0) {
      await api(token, 'DELETE', `/management/v1/users/${grant.userId}/grants/${grant.id}`, undefined, orgId);
      console.log(`  removed obsolete grant from ${grant.userName ?? grant.userId}`);
    } else {
      await api(token, 'PUT', `/management/v1/users/${grant.userId}/grants/${grant.id}`, {
        roleKeys: filtered,
      }, orgId);
      console.log(`  filtered obsolete roles from ${grant.userName ?? grant.userId}`);
    }
  }

  const currentRoles = await listRoles(token, projectId);
  const obsoleteRoles = currentRoles.filter((role) => !PROJECT_ROLE_KEYS.includes(role.key));
  for (const role of obsoleteRoles) {
    try {
      await api(token, 'DELETE', `/management/v1/projects/${projectId}/roles/${encodeURIComponent(role.key)}`, undefined, orgId);
      console.log(`  deleted obsolete role ${role.key}`);
    } catch (err) {
      console.log(`  could not delete obsolete role ${role.key}: ${err.message}`);
    }
  }
  const finalRoles = await listRoles(token, projectId);
  console.log(`  final role count: ${finalRoles.length}`);

  console.log('\n8. OIDC token lifetimes');
  const currentOidc = await api(token, 'GET', '/admin/v1/settings/oidc');
  const oidc = currentOidc?.settings ?? {};
  const desiredOidc = {
    accessTokenLifetime: '300s',
    idTokenLifetime: oidc.idTokenLifetime ?? '43200s',
    refreshTokenIdleExpiration: oidc.refreshTokenIdleExpiration ?? '2592000s',
    refreshTokenExpiration: oidc.refreshTokenExpiration ?? '7776000s',
  };
  const oidcChanged = Object.entries(desiredOidc).some(([key, value]) => oidc[key] !== value);
  if (oidcChanged) {
    await api(token, 'PUT', '/admin/v1/settings/oidc', desiredOidc, orgId);
    console.log(`  access token lifetime: ${oidc.accessTokenLifetime ?? 'unknown'} -> 300s`);
  } else {
    console.log('  token lifetimes already match');
  }

  console.log('\n9. Portal login client (ADR-0004)');
  await ensurePortalLogin(token);

  console.log('\n10. Register the concession org in the iDARMS org registry');
  const registered = registerConcessionOrg(concessionOrgId, orgId);

  console.log('\nSummary — add to apps/idarms-portal/.env.local:');
  console.log(`  ZITADEL_LOGIN_CLIENT_KEY_PATH=${LOGIN_CLIENT_KEY_PATH}`);
  console.log('  AUTH_SECRET=<openssl rand -base64 32>');
  console.log(`  ZITADEL_ISSUER=${BASE}`);
  console.log(`  ZITADEL_CLIENT_ID=${webApp.clientId}`);
  console.log(`  ZITADEL_CLIENT_SECRET=${webApp.clientSecret ?? '(unchanged from first run — see apps/idarms-portal/.env.local)'}`);
  console.log('\nServices validate with (set in each service .env):');
  console.log('  AUTH_MODE=zitadel');
  console.log(`  ZITADEL_ISSUER=${BASE}`);
  console.log(`  ZITADEL_AUDIENCE=${webApp.clientId}`);
  console.log(`  ZITADEL_JWKS_URI=${BASE}/oauth/v2/keys`);
  console.log('\nM2M (upward to CROIP — dev stand-in uses the croip-m2m machine user):');
  console.log(`  CROIP_ZITADEL_ISSUER=${BASE}`);
  if (m2mSecret) {
    console.log(`  CROIP_CLIENT_ID=${m2mSecret.clientId}`);
    console.log(`  CROIP_CLIENT_SECRET=${m2mSecret.clientSecret}`);
  } else {
    console.log('  CROIP_CLIENT_ID=croip-m2m');
    console.log('  CROIP_CLIENT_SECRET=(unchanged from first run — see apps/idarms-portal/.env.local)');
  }
  console.log('\nOrganisations:');
  console.log(`  infrastructure (ZITADEL default, not a tenant): ${orgId}`);
  console.log(`  concession "${CONCESSION_ORG_NAME}" (CONCESSION scope): ${concessionOrgId}${registered ? '' : '  <- NOT registered yet, see step 10'}`);
  console.log('\nconcessions-management-service .env:');
  console.log(`  ZITADEL_PROJECT_OWNER_ORG_ID=${orgId}`);
  console.log('\nTest user: concession-admin (CONCESSION_SUPER_ADMIN, concession org)  (password Password1!)');
  console.log('Assembly staff (field agents and others) are invited into their assembly org through the portal.');
  console.log(`Canonical roles: ${PROJECT_ROLE_KEYS.join(', ')}`);
}

/** The dedicated concession org, found by name or created once. Never the infrastructure org. */
async function ensureConcessionOrg(token, infrastructureOrgId) {
  const found = (await api(token, 'POST', '/admin/v1/orgs/_search', {
    query: { limit: 10 },
    queries: [{ nameQuery: { name: CONCESSION_ORG_NAME, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
  }))?.result ?? [];
  if (found.length > 1) {
    throw new Error(`More than one org is named "${CONCESSION_ORG_NAME}"; resolve this in the ZITADEL console first.`);
  }
  if (found[0]?.id) {
    if (found[0].id === infrastructureOrgId) {
      throw new Error(`"${CONCESSION_ORG_NAME}" is the infrastructure org; the concession needs its own org.`);
    }
    console.log(`  existing concession org "${CONCESSION_ORG_NAME}" (${found[0].id})`);
    return found[0].id;
  }
  const created = await api(token, 'POST', '/v2/organizations', { name: CONCESSION_ORG_NAME });
  const id = String(created?.organizationId ?? '');
  if (!id) throw new Error('ZITADEL did not return the new concession org id.');
  console.log(`  created concession org "${CONCESSION_ORG_NAME}" (${id})`);
  return id;
}

/** Grants the iDARMS project's human roles to the concession org so its users can hold them. */
async function ensureConcessionProjectGrant(token, projectId, infrastructureOrgId, concessionOrgId) {
  const roleKeys = [...HUMAN_ROLE_KEYS].sort();
  const grants = (await api(token, 'POST', `/management/v1/projects/${projectId}/grants/_search`, {}, infrastructureOrgId))?.result ?? [];
  const existing = grants.find((grant) => grant.grantedOrgId === concessionOrgId);
  if (!existing) {
    await api(token, 'POST', `/management/v1/projects/${projectId}/grants`, { grantedOrgId: concessionOrgId, roleKeys }, infrastructureOrgId);
    console.log('  granted the iDARMS project to the concession org');
    return;
  }
  const current = [...(existing.grantedRoleKeys ?? [])].sort();
  if (JSON.stringify(current) === JSON.stringify(roleKeys)) {
    console.log('  concession org already holds the iDARMS project grant');
    return;
  }
  await api(token, 'PUT', `/management/v1/projects/${projectId}/grants/${existing.grantId}`, { roleKeys }, infrastructureOrgId);
  console.log('  updated the concession org project grant roles');
}

/**
 * Onboarding gives every Concession Super Admin an external CONCESSION_SUPER_ADMIN
 * grant in each assembly org; the Access Directory reads those grants. A super
 * admin recreated here gets them again in every org that holds the iDARMS project
 * grant (the assembly orgs). The grant only lists access; permissions still come
 * from the home (concession) org (ADR-0003).
 */
async function grantSuperAdminInAssemblyOrgs(token, projectId, infrastructureOrgId, concessionOrgId, userId, userName) {
  const projectGrants = (await api(token, 'POST', `/management/v1/projects/${projectId}/grants/_search`, {}, infrastructureOrgId))?.result ?? [];
  for (const grant of projectGrants) {
    const assemblyOrgId = grant.grantedOrgId;
    if (!assemblyOrgId || assemblyOrgId === concessionOrgId) continue;
    const existing = (await listGrants(token, null, assemblyOrgId))
      .find((userGrant) => userGrant.userId === userId && userGrant.projectId === projectId);
    if (existing?.roleKeys?.includes('CONCESSION_SUPER_ADMIN')) continue;
    if (existing) {
      await api(token, 'PUT', `/management/v1/users/${userId}/grants/${existing.id}`, {
        roleKeys: [...new Set([...(existing.roleKeys ?? []), 'CONCESSION_SUPER_ADMIN'])],
      }, assemblyOrgId);
    } else {
      await api(token, 'POST', `/management/v1/users/${userId}/grants`, {
        userId, projectId, roleKeys: ['CONCESSION_SUPER_ADMIN'],
      }, assemblyOrgId);
    }
    console.log(`  granted ${userName} CONCESSION_SUPER_ADMIN in assembly org ${grant.grantedOrgName ?? assemblyOrgId}`);
  }
}

/**
 * Registers the concession org (CONCESSION scope, no assembly) through the same
 * operator command used in staging and production. Needs the concessions
 * database; when it is not reachable the command to run later is printed.
 */
function registerConcessionOrg(concessionOrgId, infrastructureOrgId) {
  const args = [
    '--filter', '@idarms/concessions-management-service', 'org:register-concession',
    '--org-id', concessionOrgId,
    '--sole-concession',
    '--infrastructure-org-id', infrastructureOrgId,
    '--actor', 'zitadel-bootstrap',
    '--apply',
  ];
  try {
    // One command string: every argument is an id or flag this script controls (no quoting needed).
    execSync(`pnpm ${args.join(' ')}`, { cwd: REPO_ROOT, stdio: 'inherit' });
    return true;
  } catch {
    console.log('  could not register it now (is the concessions database up?). Run later:');
    console.log(`  pnpm ${args.join(' ')}`);
    return false;
  }
}

main().catch((err) => {
  console.error('\nBootstrap failed:', err.message);
  process.exit(1);
});
