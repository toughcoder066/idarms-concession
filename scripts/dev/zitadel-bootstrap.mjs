// Config-as-code bootstrap for the local iDARMS ZITADEL instance (ADR-0003 decision 7).
//
// Organisations:
//   - ZITADEL's default org runs ZITADEL: its own project, console clients, instance
//     administration, the first-instance admin key, and croip-m2m (a stand-in for
//     CROIP's own credential). This script does not change it, and it is never
//     registered in iDARMS.
//   - The iDARMS Concession org runs iDARMS: it owns the iDARMS project (roles, portal
//     and API apps), iDARMS's machine identities and concession-wide users, and it is
//     registered in the org registry as CONCESSION (our concession id, no assembly).
//   - Assembly orgs (ASSEMBLY scope) receive the project through project grants from the
//     concession org. Onboarding creates them; this script only re-grants existing ones.
//
// The previous iDARMS project, owned by ZITADEL's default org, is only read: its project
// grants and user grants are copied to the new project. It stays as a fallback until
// it is deleted with separate approval.
//
// No human gets a ZITADEL manager role (ORG_OWNER, PROJECT_OWNER) on the concession org;
// step 8 reports any that exist.
//
// The role/capability model lives in packages/contracts/src/roles.ts. This script reads
// the compiled model so the bootstrap and application code cannot drift apart.
//
// Prereqs: the ZITADEL stack is up (pnpm zitadel:up). Run: pnpm zitadel:bootstrap

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePortalLogin, LOGIN_CLIENT_KEY_PATH } from './zitadel-login-client.mjs';
import { api, BASE, ensureMachineIdentity, tokenForMachineKey } from './zitadel-machine-identity.mjs';

const require = createRequire(import.meta.url);
const { ROLE_DEFINITIONS, PROJECT_ROLE_KEYS } = require('../../packages/contracts/dist/roles.js');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SECRETS_DIR = join(REPO_ROOT, '.secrets');
// Client ids and secrets of the new portal and API apps. Gitignored; never printed.
const APPS_FILE = join(SECRETS_DIR, 'zitadel-idarms-apps.json');
const PROVISIONER_KEY_PATH = join(SECRETS_DIR, 'zitadel-provisioner.json');
const CROIP_M2M_FILE = join(SECRETS_DIR, 'croip-m2m-dev.json');

const PROJECT_NAME = 'iDARMS';
// The dedicated iDARMS concession organisation. Found by name, created once.
const CONCESSION_ORG_NAME = process.env.IDARMS_CONCESSION_ORG_NAME ?? 'iDARMS Concession';
const PORTAL_URLS = [...new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.PORTAL_URL,
].filter(Boolean))];
const REDIRECT_URIS = PORTAL_URLS.map((url) => new URL('/api/auth/callback/zitadel', url).toString());
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
const PROJECT_SETTINGS = {
  name: PROJECT_NAME,
  // Without role assertion ZITADEL never emits the urn:zitadel:iam:org:project:*:roles claim.
  projectRoleAssertion: true,
  privateLabelingSetting: 'PRIVATE_LABELING_SETTING_ENFORCE_PROJECT_RESOURCE_OWNER_POLICY',
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

function makeList(pathTemplate) {
  return async (token, projectId, orgId) => {
    const path = pathTemplate.replace('{project_id}', projectId ?? '');
    const res = await api(token, 'POST', path, {}, orgId);
    return res?.result ?? [];
  };
}

const listProjects = makeList('/management/v1/projects/_search');
const listProjectGrants = makeList('/management/v1/projects/{project_id}/grants/_search');
const listRoles = makeList('/management/v1/projects/{project_id}/roles/_search');
const listApps = makeList('/management/v1/projects/{project_id}/apps/_search');
const listUsers = makeList('/management/v1/users/_search');
const listGrants = makeList('/management/v1/users/grants/_search');

function sameKeys(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function writeSecretJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  console.log('Reading first-instance admin machine key…');
  const machineKey = readMachineKey();
  console.log(`  machine user: ${machineKey.userId}`);
  const token = await tokenForMachineKey(machineKey);
  console.log('  management token acquired');

  console.log('\n0. ZITADEL default org (runs ZITADEL; never an iDARMS org; not changed)');
  const defaultOrgId = await findDefaultOrgId(token);
  console.log(`  org id: ${defaultOrgId}`);

  console.log(`\n1. iDARMS Concession org "${CONCESSION_ORG_NAME}"`);
  const concessionOrgId = await ensureConcessionOrg(token, defaultOrgId);
  await syncLoginBranding(token, concessionOrgId);

  console.log('\n2. iDARMS project (owned by the concession org)');
  const projectId = await ensureProject(token, concessionOrgId);

  console.log('\n3. OIDC apps');
  const apps = await ensureApps(token, concessionOrgId, projectId);

  console.log('\n4. Canonical roles');
  await syncRoles(token, concessionOrgId, projectId);

  console.log('\n5. Concession users and grants');
  for (const spec of CONCESSION_USERS) {
    const userId = await ensureConcessionUser(token, concessionOrgId, spec);
    await syncUserGrant(token, userId, projectId, spec.roles, concessionOrgId);
    console.log(`  synced grant for ${spec.userName}: ${spec.roles.join(', ')}`);
  }

  console.log('\n6. Assembly orgs: project grants and user grants');
  const legacyProjectId = await copyFromLegacyProject(token, { defaultOrgId, concessionOrgId, projectId });

  console.log('\n7. iDARMS machine identities (concession org)');
  console.log('  provisioner (assembly onboarding and staff management):');
  await ensureMachineIdentity(token, {
    orgId: concessionOrgId,
    userName: 'idarms-provisioner',
    name: 'iDARMS provisioner',
    description: 'Backend provisioning for assembly onboarding and staff management (ADR-0003)',
    // The narrowest ZITADEL role that can create organisations (ADR-0003 decision 7).
    instanceRole: 'IAM_ORG_MANAGER',
    keyPath: PROVISIONER_KEY_PATH,
  });
  console.log('  portal login client (ADR-0004):');
  await ensurePortalLogin(token, { orgId: concessionOrgId, projectId });

  console.log('\n8. No ZITADEL manager roles in the concession org');
  await reportManagers(token, concessionOrgId, projectId);

  console.log('\n9. croip-m2m (stand-in for CROIP\'s credential, ZITADEL default org)');
  await reportCroipStandIn(token, defaultOrgId);

  console.log('\n10. OIDC token lifetimes');
  await syncTokenLifetimes(token);

  console.log('\n11. Register the concession org in the iDARMS org registry');
  const registered = registerConcessionOrg(concessionOrgId, defaultOrgId);

  console.log('\nSummary. Secrets are in gitignored files; copy them, do not paste them anywhere else.');
  console.log('\napps/idarms-portal/.env.local:');
  console.log(`  ZITADEL_ISSUER=${BASE}`);
  console.log(`  ZITADEL_CLIENT_ID=${apps.portal.clientId}`);
  console.log(`  ZITADEL_CLIENT_SECRET=<"portal.clientSecret" in ${APPS_FILE}>`);
  console.log(`  ZITADEL_PROJECT_ID=${projectId}`);
  console.log(`  ZITADEL_LOGIN_CLIENT_KEY_PATH=${LOGIN_CLIENT_KEY_PATH}`);
  console.log('\nEvery service .env (AUTH_MODE=zitadel):');
  console.log(`  ZITADEL_ISSUER=${BASE}`);
  console.log(`  ZITADEL_AUDIENCE=${apps.portal.clientId}`);
  console.log(`  ZITADEL_JWKS_URI=${BASE}/oauth/v2/keys`);
  console.log(`  ZITADEL_PROJECT_ID=${projectId}`);
  console.log('\nservices/concessions-management-service/.env, in addition:');
  console.log(`  ZITADEL_PROJECT_OWNER_ORG_ID=${concessionOrgId}`);
  console.log(`  ZITADEL_DEFAULT_ORG_ID=${defaultOrgId}`);
  console.log('  ZITADEL_PROVISIONING_KEY_PATH=../../.secrets/zitadel-provisioner.json');
  console.log('  CROIP_INTEGRATION_URL=http://localhost:3090');
  console.log('\nUnchanged: CROIP_* settings (croip-m2m and its project id).');
  console.log('\nOrganisations:');
  console.log(`  ZITADEL default org (not an iDARMS org): ${defaultOrgId}`);
  console.log(`  "${CONCESSION_ORG_NAME}" (CONCESSION scope, owns the iDARMS project): ${concessionOrgId}${registered ? '' : '  <- NOT registered yet, see step 11'}`);
  console.log(`  iDARMS project: ${projectId}`);
  if (legacyProjectId) {
    console.log(`  previous iDARMS project ${legacyProjectId} (ZITADEL default org): unchanged; delete only with explicit approval`);
  }
  console.log('\nTest user: concession-admin (CONCESSION_SUPER_ADMIN, concession org)  (password Password1!)');
  console.log('Assembly staff (field agents and others) are invited into their assembly org through the portal.');
  console.log(`Canonical roles: ${PROJECT_ROLE_KEYS.join(', ')}`);
}

/** ZITADEL's default org, which must be the org of the first-instance admin key. */
async function findDefaultOrgId(token) {
  const found = (await api(token, 'POST', '/v2/organizations/_search', {
    query: { limit: 1 },
    queries: [{ defaultQuery: {} }],
  }))?.result ?? [];
  const id = found[0]?.id;
  if (!id) throw new Error('ZITADEL did not return its default organization.');
  const own = (await api(token, 'GET', '/management/v1/orgs/me'))?.org?.id;
  if (own && own !== id) {
    console.log(`  note: the first-instance admin key belongs to org ${own}, not the default org`);
  }
  return String(id);
}

/** The dedicated concession org, found by name or created once. Never ZITADEL's default org. */
async function ensureConcessionOrg(token, defaultOrgId) {
  const found = (await api(token, 'POST', '/v2/organizations/_search', {
    query: { limit: 10 },
    queries: [{ nameQuery: { name: CONCESSION_ORG_NAME, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
  }))?.result ?? [];
  if (found.length > 1) {
    throw new Error(`More than one org is named "${CONCESSION_ORG_NAME}"; resolve this in the ZITADEL console first.`);
  }
  if (found[0]?.id) {
    if (found[0].id === defaultOrgId) {
      throw new Error(`"${CONCESSION_ORG_NAME}" is ZITADEL's default org; iDARMS needs its own org.`);
    }
    console.log(`  existing org ${found[0].id}`);
    return String(found[0].id);
  }
  const created = await api(token, 'POST', '/v2/organizations', { name: CONCESSION_ORG_NAME });
  const id = String(created?.organizationId ?? '');
  if (!id) throw new Error('ZITADEL did not return the new concession org id.');
  console.log(`  created org ${id}`);
  return id;
}

/** The project's resource-owner branding (PRIVATE_LABELING_SETTING_ENFORCE_PROJECT_RESOURCE_OWNER_POLICY). */
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
  console.log('  applied iDARMS login colors');
}

async function ensureProject(token, concessionOrgId) {
  // Only projects this org owns; the old project is only granted to it.
  const project = (await listProjects(token, null, concessionOrgId))
    .find((p) => p.name === PROJECT_NAME && (p.details?.resourceOwner ?? concessionOrgId) === concessionOrgId);
  if (project) {
    await api(token, 'PUT', `/management/v1/projects/${project.id}`, PROJECT_SETTINGS, concessionOrgId)
      .catch((err) => { if (!String(err.message).includes('No changes')) throw err; });
    console.log(`  existing project ${project.id}`);
    return String(project.id);
  }
  const created = await api(token, 'POST', '/management/v1/projects', PROJECT_SETTINGS, concessionOrgId);
  console.log(`  created project ${created.id}`);
  return String(created.id);
}

/** The portal (OIDC web) and API apps. Their secrets go to APPS_FILE only. */
async function ensureApps(token, orgId, projectId) {
  const saved = readJson(APPS_FILE);
  const stored = saved?.projectId === projectId ? saved : { projectId };
  const existing = await listApps(token, projectId, orgId);

  let web = existing.find((a) => a.name === 'idarms-portal');
  if (!web) {
    const created = await api(token, 'POST', `/management/v1/projects/${projectId}/apps/oidc`, {
      name: 'idarms-portal',
      appType: 'OIDC_APP_TYPE_WEB',
      authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
      grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'OIDC_GRANT_TYPE_REFRESH_TOKEN'],
      responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
      redirectUris: REDIRECT_URIS,
      postLogoutRedirectUris: POST_LOGOUT_REDIRECT_URIS,
      version: 'OIDC_VERSION_1_0',
      accessTokenType: 'OIDC_TOKEN_TYPE_JWT',
      accessTokenRoleAssertion: true,
      idTokenRoleAssertion: true,
      clockSkew: '0s',
      devMode: true,
    }, orgId);
    stored.portal = { appId: created.appId, clientId: created.clientId, clientSecret: created.clientSecret };
    console.log(`  created portal app ${created.appId} (client ${created.clientId})`);
  } else {
    const clientId = web.oidcConfig?.clientId;
    console.log(`  existing portal app ${web.id} (client ${clientId})`);
    if (stored.portal?.clientId !== clientId || !stored.portal?.clientSecret) {
      const generated = await api(token, 'POST', `/management/v1/projects/${projectId}/apps/${web.id}/oidc_config/_generate_client_secret`, {}, orgId);
      stored.portal = { appId: web.id, clientId, clientSecret: generated.clientSecret };
      console.log('  no saved portal secret; generated a new one');
    }
  }

  const apiApp = existing.find((a) => a.name === 'idarms-api');
  if (!apiApp) {
    const created = await api(token, 'POST', `/management/v1/projects/${projectId}/apps/api`, {
      name: 'idarms-api',
      authMethodType: 'API_AUTH_METHOD_TYPE_BASIC',
    }, orgId);
    stored.api = { appId: created.appId, clientId: created.clientId, clientSecret: created.clientSecret };
    console.log(`  created API app ${created.appId} (client ${created.clientId})`);
  } else {
    const clientId = apiApp.apiConfig?.clientId;
    console.log(`  existing API app ${apiApp.id} (client ${clientId})`);
    if (stored.api?.clientId !== clientId || !stored.api?.clientSecret) {
      const generated = await api(token, 'POST', `/management/v1/projects/${projectId}/apps/${apiApp.id}/api_config/_generate_client_secret`, {}, orgId);
      stored.api = { appId: apiApp.id, clientId, clientSecret: generated.clientSecret };
      console.log('  no saved API secret; generated a new one');
    }
  }

  writeSecretJson(APPS_FILE, stored);
  console.log(`  client ids and secrets saved to ${APPS_FILE} (secrets not printed)`);

  if (web) {
    const oidc = web.oidcConfig ?? {};
    const postLogout = [...new Set([...(oidc.postLogoutRedirectUris ?? []), ...POST_LOGOUT_REDIRECT_URIS])];
    if (postLogout.length !== (oidc.postLogoutRedirectUris ?? []).length) {
      await api(token, 'PUT', `/management/v1/projects/${projectId}/apps/${web.id}/oidc_config`, {
        redirectUris: oidc.redirectUris ?? REDIRECT_URIS,
        responseTypes: oidc.responseTypes,
        grantTypes: oidc.grantTypes,
        appType: oidc.appType,
        authMethodType: oidc.authMethodType,
        postLogoutRedirectUris: postLogout,
        devMode: oidc.devMode,
        accessTokenType: oidc.accessTokenType,
        accessTokenRoleAssertion: oidc.accessTokenRoleAssertion,
        idTokenRoleAssertion: oidc.idTokenRoleAssertion,
        idTokenUserinfoAssertion: oidc.idTokenUserinfoAssertion,
        clockSkew: oidc.clockSkew,
        loginVersion: oidc.loginVersion,
      }, orgId);
      console.log('  registered the portal signed-out page for ZITADEL logout');
    }
  }
  return stored;
}

async function syncRoles(token, orgId, projectId) {
  const existingKeys = new Set((await listRoles(token, projectId, orgId)).map((role) => role.key));
  for (const definition of ROLE_DEFINITIONS) {
    const body = { roleKey: definition.key, displayName: definition.displayName, group: definition.group };
    if (existingKeys.has(definition.key)) {
      await api(token, 'PUT', `/management/v1/projects/${projectId}/roles/${encodeURIComponent(definition.key)}`, body, orgId)
        .catch((err) => { if (!String(err.message).includes('No changes')) throw err; });
    } else {
      await api(token, 'POST', `/management/v1/projects/${projectId}/roles`, body, orgId);
      console.log(`  created role ${definition.key}`);
    }
  }
  for (const role of await listRoles(token, projectId, orgId)) {
    if (PROJECT_ROLE_KEYS.includes(role.key)) continue;
    await api(token, 'DELETE', `/management/v1/projects/${projectId}/roles/${encodeURIComponent(role.key)}`, undefined, orgId);
    console.log(`  deleted obsolete role ${role.key}`);
  }
  console.log(`  ${ROLE_DEFINITIONS.length} canonical roles present`);
}

async function ensureConcessionUser(token, orgId, spec) {
  let user = (await listUsers(token, null, orgId)).find((u) => u.userName === spec.userName);
  // Repair users created by an older bootstrap version that used the wrong
  // `password` field (they end up stuck in USER_STATE_INITIAL and cannot log in).
  if (user && user.state === 'USER_STATE_INITIAL') {
    await api(token, 'DELETE', `/management/v1/users/${user.id}`, undefined, orgId);
    console.log(`  removed uninitialized user ${spec.userName}, will recreate`);
    user = null;
  }
  if (user) {
    console.log(`  existing user ${spec.userName} (${user.id})`);
    return user.id;
  }
  const created = await api(token, 'POST', '/management/v1/users/human', {
    userName: spec.userName,
    profile: { firstName: spec.givenName, lastName: spec.familyName },
    email: { email: spec.email, isEmailVerified: true },
    initialPassword: 'Password1!',
  }, orgId);
  console.log(`  created user ${spec.userName} (${created.userId})`);
  return created.userId;
}

/** Creates or updates the user's grant on the project, owned by `orgId`. */
async function syncUserGrant(token, userId, projectId, roleKeys, orgId) {
  const existing = (await listGrants(token, null, orgId))
    .find((grant) => grant.userId === userId && grant.projectId === projectId);
  if (!existing) {
    await api(token, 'POST', `/management/v1/users/${userId}/grants`, { userId, projectId, roleKeys }, orgId);
    return;
  }
  if (sameKeys(existing.roleKeys ?? [], roleKeys)) return;
  await api(token, 'PUT', `/management/v1/users/${userId}/grants/${existing.id}`, { roleKeys }, orgId);
}

async function ensureProjectGrant(token, projectId, ownerOrgId, grantedOrgId, roleKeys, label) {
  const existing = (await listProjectGrants(token, projectId, ownerOrgId))
    .find((grant) => grant.grantedOrgId === grantedOrgId);
  if (!existing) {
    await api(token, 'POST', `/management/v1/projects/${projectId}/grants`, { grantedOrgId, roleKeys }, ownerOrgId);
    console.log(`  granted the iDARMS project to ${label}`);
    return;
  }
  if (sameKeys(existing.grantedRoleKeys ?? [], roleKeys)) {
    console.log(`  ${label} already holds the project grant`);
    return;
  }
  await api(token, 'PUT', `/management/v1/projects/${projectId}/grants/${existing.grantId}`, { roleKeys }, ownerOrgId);
  console.log(`  updated the project grant roles of ${label}`);
}

/**
 * Copies the previous project's grants to the new one, reading the previous project
 * only: each assembly org gets the same project grant from the concession org, and each
 * user grant (assembly staff, and the super admin's external grants that the Access
 * Directory reads) is recreated with the same roles. A grant that already exists on the
 * new project is left as it is, so later changes there are not overwritten.
 */
async function copyFromLegacyProject(token, { defaultOrgId, concessionOrgId, projectId }) {
  const legacy = (await listProjects(token, null, defaultOrgId)).find((p) => p.name === PROJECT_NAME);
  if (!legacy) {
    console.log('  no previous iDARMS project in the ZITADEL default org; nothing to copy');
    return null;
  }
  console.log(`  previous project ${legacy.id} (read only)`);
  const orgs = [{ orgId: concessionOrgId, label: 'the concession org' }];
  for (const grant of await listProjectGrants(token, legacy.id, defaultOrgId)) {
    if (!grant.grantedOrgId || grant.grantedOrgId === concessionOrgId) continue;
    const label = `assembly org ${grant.grantedOrgName ?? grant.grantedOrgId}`;
    const roleKeys = (grant.grantedRoleKeys ?? []).filter((key) => PROJECT_ROLE_KEYS.includes(key));
    await ensureProjectGrant(token, projectId, concessionOrgId, grant.grantedOrgId, roleKeys, label);
    orgs.push({ orgId: grant.grantedOrgId, label });
  }

  for (const { orgId, label } of orgs) {
    const grants = await listGrants(token, null, orgId);
    const current = new Set(grants.filter((g) => g.projectId === projectId).map((g) => g.userId));
    for (const grant of grants) {
      if (grant.projectId !== legacy.id || current.has(grant.userId)) continue;
      const roleKeys = (grant.roleKeys ?? []).filter((key) => PROJECT_ROLE_KEYS.includes(key));
      if (roleKeys.length === 0) continue;
      await api(token, 'POST', `/management/v1/users/${grant.userId}/grants`, {
        userId: grant.userId, projectId, roleKeys,
      }, orgId);
      console.log(`  ${label}: granted ${grant.userName ?? grant.userId} ${roleKeys.join(', ')}`);
    }
  }
  return String(legacy.id);
}

/** Reports any ZITADEL org or project manager in the concession org. Changes nothing. */
async function reportManagers(token, concessionOrgId, projectId) {
  const orgMembers = (await api(token, 'POST', '/management/v1/orgs/me/members/_search', {}, concessionOrgId))?.result ?? [];
  const projectMembers = (await api(token, 'POST', `/management/v1/projects/${projectId}/members/_search`, {}, concessionOrgId))?.result ?? [];
  const all = [
    ...orgMembers.map((m) => ({ ...m, on: 'org' })),
    ...projectMembers.map((m) => ({ ...m, on: 'project' })),
  ];
  if (all.length === 0) {
    console.log('  none: no one holds ORG_OWNER, PROJECT_OWNER or any other manager role there');
    return;
  }
  for (const member of all) {
    console.log(`  WARNING: ${member.userName ?? member.displayName ?? member.userId} holds ${(member.roles ?? []).join(', ')} on the ${member.on}; remove it unless an operator needs it`);
  }
}

/** croip-m2m is CROIP's stand-in, not an iDARMS identity: never changed once it exists. */
async function reportCroipStandIn(token, defaultOrgId) {
  const user = (await listUsers(token, null, defaultOrgId)).find((u) => u.userName === 'croip-m2m');
  if (user) {
    console.log(`  existing machine user croip-m2m (${user.id}); not changed`);
    return;
  }
  const created = await api(token, 'POST', '/management/v1/users/machine', {
    userName: 'croip-m2m',
    name: 'CROIP M2M Client',
    description: 'Dev stand-in for the client credentials CROIP issues to this concession',
    accessTokenType: 'ACCESS_TOKEN_TYPE_JWT',
  }, defaultOrgId);
  const secret = await api(token, 'PUT', `/management/v1/users/${created.userId}/secret`, {}, defaultOrgId);
  writeSecretJson(CROIP_M2M_FILE, { clientId: secret.clientId, clientSecret: secret.clientSecret });
  console.log(`  created croip-m2m (${created.userId}); credentials saved to ${CROIP_M2M_FILE}`);
}

async function syncTokenLifetimes(token) {
  const oidc = (await api(token, 'GET', '/admin/v1/settings/oidc'))?.settings ?? {};
  const desired = {
    accessTokenLifetime: '300s',
    idTokenLifetime: oidc.idTokenLifetime ?? '43200s',
    refreshTokenIdleExpiration: oidc.refreshTokenIdleExpiration ?? '2592000s',
    refreshTokenExpiration: oidc.refreshTokenExpiration ?? '7776000s',
  };
  if (Object.entries(desired).some(([key, value]) => oidc[key] !== value)) {
    await api(token, 'PUT', '/admin/v1/settings/oidc', desired);
    console.log(`  access token lifetime: ${oidc.accessTokenLifetime ?? 'unknown'} -> 300s`);
  } else {
    console.log('  token lifetimes already match');
  }
}

/**
 * Registers the concession org (CONCESSION scope, no assembly) through the same
 * operator command used in staging and production. Needs the concessions
 * database; when it is not reachable the command to run later is printed.
 */
function registerConcessionOrg(concessionOrgId, defaultOrgId) {
  const args = [
    '--filter', '@idarms/concessions-management-service', 'org:register-concession',
    '--org-id', concessionOrgId,
    '--sole-concession',
    '--default-org-id', defaultOrgId,
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
