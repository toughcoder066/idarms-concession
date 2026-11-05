// iDARMS machine identities in the local ZITADEL (ADR-0003 decision 7): a machine user
// in the iDARMS Concession org, exactly one instance role, and a JSON key written to a
// gitignored .secrets/ file. Keys are never printed.
import { createSign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const BASE = process.env.ZITADEL_URL ?? 'http://localhost:8080';

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

export async function api(token, method, path, body, orgId) {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' };
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
    const error = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

async function ensureMachineUser(token, spec) {
  const users = (await api(token, 'POST', '/management/v1/users/_search', {
    queries: [{ userNameQuery: { userName: spec.userName, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
  }, spec.orgId))?.result ?? [];
  if (users[0]?.id) {
    console.log(`  existing machine user ${spec.userName} (${users[0].id})`);
    return users[0].id;
  }
  const created = await api(token, 'POST', '/management/v1/users/machine', {
    userName: spec.userName,
    name: spec.name,
    description: spec.description,
    accessTokenType: 'ACCESS_TOKEN_TYPE_BEARER',
  }, spec.orgId);
  console.log(`  created machine user ${spec.userName} (${created.userId})`);
  return created.userId;
}

/** Sets the user's instance roles to exactly `[role]`, replacing anything broader. */
async function ensureInstanceRole(token, userId, role) {
  const members = (await api(token, 'POST', '/admin/v1/members/_search', {
    queries: [{ userIdQuery: { userId } }],
  }))?.result ?? [];
  const current = members.find((member) => member.userId === userId)?.roles ?? [];
  if (current.length === 1 && current[0] === role) {
    console.log(`  instance role ${role} already present (and nothing broader)`);
    return;
  }
  if (current.length === 0) {
    await api(token, 'POST', '/admin/v1/members', { userId, roles: [role] });
    console.log(`  granted instance role ${role}`);
    return;
  }
  await api(token, 'PUT', `/admin/v1/members/${userId}`, { roles: [role] });
  console.log(`  set instance roles to ${role} (was ${current.join(', ')})`);
}

async function ensureMachineKey(token, userId, orgId, keyPath) {
  if (existsSync(keyPath)) {
    const key = JSON.parse(readFileSync(keyPath, 'utf8'));
    if (key.userId === userId) {
      try {
        await tokenForMachineKey(key);
        console.log(`  existing key works (${keyPath})`);
        return;
      } catch {
        console.log('  existing key no longer works; issuing a new one');
      }
    }
  }
  const created = await api(token, 'POST', `/management/v1/users/${userId}/keys`, { type: 'KEY_TYPE_JSON' }, orgId);
  const keyJson = Buffer.from(created.keyDetails, 'base64').toString('utf8');
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, keyJson, { mode: 0o600 });
  console.log(`  wrote new key to ${keyPath} (contents not printed)`);
}

/**
 * spec: { orgId, userName, name, description, instanceRole, keyPath }.
 * Idempotent; returns the machine user id.
 */
export async function ensureMachineIdentity(token, spec) {
  const userId = await ensureMachineUser(token, spec);
  await ensureInstanceRole(token, userId, spec.instanceRole);
  await ensureMachineKey(token, userId, spec.orgId, spec.keyPath);
  return userId;
}
