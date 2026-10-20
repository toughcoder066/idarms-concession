// Config-as-code bootstrap for the local iDARMS ZITADEL instance.
// Creates the iDARMS project, API + web apps, roles, human users, user metadata
// (concessionId/assemblyId), user grants, and a token-customization action that
// injects the urn:idarms:context claim into access tokens.
//
// Prereqs: the ZITADEL stack is up (pnpm zitadel:up). Run: pnpm zitadel:bootstrap

import { execSync } from 'node:child_process';
import { createSign } from 'node:crypto';

const BASE = process.env.ZITADEL_URL ?? 'http://localhost:8080';
const PROJECT_NAME = 'iDARMS';

const ROLES = [
  'ratepayer:read',
  'property:read',
  'property:create',
  'property:verify',
  'property:update',
  'document:read',
  'document:upload',
  'valuation:read',
  'valuation:calculate',
  'bill:read',
  'bill:generate',
  'payment:read',
  'payment:checkout',
  'reconciliation:read',
  'reconciliation:reconcile',
  'reporting:read',
  'integration:sync',
];

const DEV_CONCESSION_ID = '11111111-1111-1111-1111-111111111111';
const DEV_ASSEMBLY_ID = '22222222-2222-2222-2222-222222222222';

const USERS = [
  {
    userName: 'concession-admin',
    givenName: 'Concession',
    familyName: 'Admin',
    email: 'concession-admin@idarms.local',
    roles: ROLES,
  },
  {
    userName: 'field-agent',
    givenName: 'Field',
    familyName: 'Agent',
    email: 'field-agent@idarms.local',
    roles: ['property:read', 'property:verify', 'ratepayer:read', 'document:read'],
  },
];

const CONTEXT_ACTION_SCRIPT = [
  'function idarmsContext(ctx, api) {',
  '  const md = ctx.v1.user.getMetadata();',
  '  const entries = (md && md.metadata) || [];',
  '  const get = (key) => {',
  '    const found = entries.find((entry) => entry.key === key);',
  '    return found ? found.value : undefined;',
  '  };',
  '  const concessionId = get(\'concessionId\');',
  '  const assemblyId = get(\'assemblyId\');',
  '  if (concessionId && assemblyId) {',
  "    api.v1.claims.setClaim('urn:idarms:context', {",
  '      concessionId: concessionId,',
  '      assemblyId: assemblyId,',
  '    });',
  '  }',
  '}',
].join('\n');

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

async function main() {
  console.log('Reading first-instance admin machine key…');
  const machineKey = readMachineKey();
  console.log(`  machine user: ${machineKey.userId}`);

  console.log('Exchanging machine key for a management access token (JWT profile)…');
  const token = await obtainManagementToken(machineKey);
  console.log('  management token acquired');

  console.log('\n0. Org');
  const myOrg = await api(token, 'GET', '/management/v1/orgs/me');
  const orgId = myOrg?.org?.id;
  console.log(`  org id: ${orgId}`);

  console.log('\n1. Project');
  let project = (await listProjects(token)).find((p) => p.name === PROJECT_NAME);
  if (project) {
    console.log(`  existing project ${project.id}`);
    // Ensure the project-level role assertion flag is enabled; without it ZITADEL
    // never emits the urn:zitadel:iam:org:project:*:roles claim in tokens.
    await api(token, 'PUT', `/management/v1/projects/${project.id}`, {
      name: PROJECT_NAME,
      projectRoleAssertion: true,
    });
    console.log('  enabled project role assertion');
  } else {
    project = await api(token, 'POST', '/management/v1/projects', {
      name: PROJECT_NAME,
      projectRoleAssertion: true,
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
      postLogoutRedirectUris: ['http://localhost:3000'],
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

  console.log('\n3. Roles');
  const existingRoleKeys = new Set((await listRoles(token, projectId)).map((r) => r.key));
  for (const role of ROLES) {
    if (existingRoleKeys.has(role)) continue;
    await api(token, 'POST', `/management/v1/projects/${projectId}/roles`, {
      roleKey: role,
      displayName: role,
      group: 'iDARMS',
    });
    console.log(`  created role ${role}`);
  }
  console.log(`  ${ROLES.length} roles present`);

  console.log('\n4. Users, metadata and grants');
  const existingUsers = await listUsers(token);
  const usersByLogin = new Map(existingUsers.map((u) => [u.userName, u]));
  for (const spec of USERS) {
    let user = usersByLogin.get(spec.userName);
    // Repair users created by an older bootstrap version that used the wrong
    // `password` field (they end up stuck in USER_STATE_INITIAL and cannot log in).
    if (user && user.state === 'USER_STATE_INITIAL') {
      await api(token, 'DELETE', `/management/v1/users/${user.id}`);
      console.log(`  removed uninitialized user ${spec.userName}, will recreate`);
      user = null;
    }
    if (!user) {
      user = await api(token, 'POST', '/management/v1/users/human', {
        userName: spec.userName,
        profile: { firstName: spec.givenName, lastName: spec.familyName },
        email: { email: spec.email, isEmailVerified: true },
        initialPassword: 'Password1!',
      });
      console.log(`  created user ${spec.userName} (${user.userId})`);
    } else {
      console.log(`  existing user ${spec.userName} (${user.id})`);
    }
    const userId = user.userId ?? user.id;

    await api(token, 'POST', `/management/v1/users/${userId}/metadata/concessionId`, {
      value: b64url(DEV_CONCESSION_ID),
    });
    await api(token, 'POST', `/management/v1/users/${userId}/metadata/assemblyId`, {
      value: b64url(DEV_ASSEMBLY_ID),
    });
    console.log(`  set concession/assembly metadata for ${spec.userName}`);

    if (spec.roles.length > 0) {
      try {
        await api(token, 'POST', `/management/v1/users/${userId}/grants`, {
          userId,
          projectId,
          roleKeys: spec.roles,
        });
        console.log(`  granted ${spec.roles.length} roles to ${spec.userName}`);
      } catch (err) {
        if (String(err.message).includes('409')) {
          console.log(`  grant for ${spec.userName} already present`);
        } else {
          throw err;
        }
      }
    }
  }

  console.log('\n5. Token action (urn:idarms:context)');
  let action = (await listActions(token, null, orgId)).find((a) => a.name === 'idarmsContext');
  if (!action) {
    action = await api(token, 'POST', '/management/v1/actions', {
      name: 'idarmsContext',
      script: CONTEXT_ACTION_SCRIPT,
      timeout: '10s',
      allowedToFail: false,
    }, orgId);
    console.log(`  created action ${action.id}`);
  } else {
    await api(token, 'PUT', `/management/v1/actions/${action.id}`, {
      name: 'idarmsContext',
      script: CONTEXT_ACTION_SCRIPT,
      timeout: '10s',
      allowedToFail: false,
    }, orgId);
    console.log(`  existing action ${action.id} (script refreshed)`);
  }
  try {
    await api(token, 'POST', '/management/v1/flows/2/trigger/5', { actionIds: [action.id] }, orgId);
    console.log('  bound action to Complement Token / Pre Access Token Creation');
  } catch (err) {
    if (String(err.message).includes('No Changes') || String(err.message).includes('"code":9')) {
      console.log('  action already bound to Complement Token / Pre Access Token Creation');
    } else {
      throw err;
    }
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

  // Give the machine user the same tenancy context + a read role so an
  // end-to-end authenticated service call can be tested without a browser.
  await api(token, 'POST', `/management/v1/users/${m2mUserId}/metadata/concessionId`, {
    value: b64url(DEV_CONCESSION_ID),
  });
  await api(token, 'POST', `/management/v1/users/${m2mUserId}/metadata/assemblyId`, {
    value: b64url(DEV_ASSEMBLY_ID),
  });
  try {
    await api(token, 'POST', `/management/v1/users/${m2mUserId}/grants`, {
      userId: m2mUserId,
      projectId,
      roleKeys: ['ratepayer:read', 'property:read'],
    });
    console.log('  granted ratepayer:read + property:read to croip-m2m');
  } catch (err) {
    if (String(err.message).includes('409')) console.log('  croip-m2m roles already granted');
    else throw err;
  }

  console.log('\nSummary — add to apps/idarms-portal/.env.local:');
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
  console.log('\nTest users: concession-admin / field-agent  (password Password1!)');
}

main().catch((err) => {
  console.error('\nBootstrap failed:', err.message);
  process.exit(1);
});
