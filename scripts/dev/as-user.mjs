// Call a local iDARMS service as any role in any registered org, without a
// ZITADEL login. Works only against a service started with header identity
// (AUTH_MODE=disabled), which may only listen on loopback; services running with
// ZITADEL auth ignore these headers and answer 401. See docs/LOCAL_DEVELOPMENT.md.
//
//   pnpm as-user --list
//   pnpm as-user --org accra --role FIELD_AGENT GET http://127.0.0.1:3020/v1/ratepayers
//   pnpm as-user --org concession --role CONCESSION_SUPER_ADMIN GET http://127.0.0.1:3010/v1/properties
//   pnpm as-user --org ledzokuku --role ASSEMBLY_ADMIN POST http://127.0.0.1:3110/v1/zones '{"name":"Zone 1"}'
//
// --org matches an org id or the start of its primary domain ("concession" picks
// the CONCESSION org). The tenant comes from the local org registry, exactly as
// a verified token would resolve it; roles give permissions through the role model.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { capabilitiesForRoles, PROJECT_ROLE_KEYS } = require('../../packages/contracts/dist/roles.js');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

function registry() {
  const sql = "select org_id, scope, concession_id, coalesce(assembly_id::text, ''), coalesce(primary_domain, '') "
    + "from zitadel_org_contexts where status = 'ACTIVE' order by scope, primary_domain";
  const out = execFileSync('docker', [
    'exec', process.env.IDARMS_PG_CONTAINER ?? 'idarms-postgres',
    'psql', '-U', 'idarms', '-d', 'concession_mgmt_db', '-tAF', '|', '-c', sql,
  ], { encoding: 'utf8' });
  return out.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [orgId, scope, concessionId, assemblyId, domain] = line.split('|');
    return { orgId, scope, concessionId, assemblyId: assemblyId || null, domain };
  });
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};

if (args.includes('--list')) {
  console.log('Registered orgs (local registry):');
  for (const org of registry()) console.log(`  ${org.scope.padEnd(10)} ${org.orgId}  ${org.domain || '(concession org)'}  assembly ${org.assemblyId ?? '-'}`);
  console.log(`\nRoles: ${PROJECT_ROLE_KEYS.join(', ')}`);
  process.exit(0);
}

const orgQuery = flag('org');
const roles = (flag('role') ?? '').split(',').map((r) => r.trim()).filter(Boolean);
const actor = flag('actor') ?? `dev-${(roles[0] ?? 'user').toLowerCase()}`;
const [method = 'GET', url, body] = args;
if (!orgQuery || !url) {
  console.error('Usage: pnpm as-user --org <org> --role <ROLE[,ROLE]> [--actor <id>] <METHOD> <url> [json body]   (or --list)');
  process.exit(2);
}
const unknownRole = roles.find((role) => !PROJECT_ROLE_KEYS.includes(role));
if (unknownRole) {
  console.error(`Unknown role ${unknownRole}. Roles: ${PROJECT_ROLE_KEYS.join(', ')}`);
  process.exit(2);
}
const target = new URL(url);
if (!LOOPBACK.has(target.hostname)) {
  console.error(`Refusing ${target.hostname}: header identity is for loopback services only.`);
  process.exit(2);
}

const orgs = registry();
const org = orgs.find((o) => o.orgId === orgQuery)
  ?? (orgQuery === 'concession' ? orgs.find((o) => o.scope === 'CONCESSION') : orgs.find((o) => o.domain.startsWith(orgQuery)));
if (!org) {
  console.error(`No registered org matches "${orgQuery}". Try --list.`);
  process.exit(2);
}

const permissions = capabilitiesForRoles(roles);
const headers = {
  'x-idarms-actor-id': actor,
  'x-idarms-roles': roles.join(','),
  // An empty list would fall back to the service's default permissions; 'none' grants nothing.
  'x-idarms-permissions': permissions.length > 0 ? permissions.join(',') : 'none',
  'x-idarms-org-id': org.orgId,
  'x-idarms-authorized-org-ids': org.orgId,
  'x-idarms-concession-id': org.concessionId,
  'x-idarms-scope-level': org.scope,
  ...(org.assemblyId ? { 'x-idarms-assembly-id': org.assemblyId } : {}),
  ...(body ? { 'content-type': 'application/json' } : {}),
};

console.error(`as ${actor} [${roles.join(',') || 'no role'}] in ${org.scope} ${org.domain || org.orgId}`);
const response = await fetch(target, { method, headers, body });
const text = await response.text();
console.error(`${response.status} ${response.statusText}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
