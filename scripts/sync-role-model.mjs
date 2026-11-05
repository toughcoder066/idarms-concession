import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(repoRoot, 'packages', 'contracts', 'src', 'roles.ts');
const source = readFileSync(sourcePath, 'utf8');
const header = [
  '// Generated from packages/contracts/src/roles.ts. Do not edit by hand.',
  '// Run `node scripts/sync-role-model.mjs` after changing the canonical model.',
  '',
].join('\n');

const orgContextSource = `import { config } from '../config';

export interface OrgContext {
  orgId: string;
  concessionId: string;
  assemblyId: string | null;
  scope: 'CONCESSION' | 'ASSEMBLY';
}

// Cached per verified home org, never per token. The short lifetimes bound how long a
// registry row that was removed or changed can still be served (ADR-0003).
export const ORG_CONTEXT_TTL_MS = 60 * 1000;
export const ORG_NOT_REGISTERED_TTL_MS = 15 * 1000;
const cache = new Map<string, { value: OrgContext | null; expiresAt: number }>();

function isOrgContextFor(value: unknown, orgId: string): value is OrgContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as Record<string, unknown>;
  if (context.orgId !== orgId) return false;
  if (typeof context.concessionId !== 'string' || context.concessionId === '') return false;
  if (context.scope === 'CONCESSION') return context.assemblyId === null;
  if (context.scope === 'ASSEMBLY') return typeof context.assemblyId === 'string' && context.assemblyId !== '';
  return false;
}

/**
 * The caller's own tenant, from the org registry in concessions-management
 * (GET /v1/org-context/me). homeOrgId must be the home organisation claim of the
 * verified token, and accessToken that same token: concessions-management verifies
 * it again and answers only for the token's own home org. The token is sent once
 * and is never cached, logged or put in an error. Any failure, or an answer for a
 * different org, resolves to null, so the caller gets no tenant.
 */
export async function resolveOrgContext(homeOrgId: string, accessToken: string): Promise<OrgContext | null> {
  const now = Date.now();
  const cached = cache.get(homeOrgId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    let base = config.orgContextUrl;
    while (base.endsWith('/')) base = base.slice(0, -1);
    const response = await fetch(base + '/v1/org-context/me', {
      headers: { authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 404) {
      cache.set(homeOrgId, { value: null, expiresAt: now + ORG_NOT_REGISTERED_TTL_MS });
      return null;
    }
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!isOrgContextFor(value, homeOrgId)) return null;
    cache.set(homeOrgId, { value, expiresAt: now + ORG_CONTEXT_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

/** Tests only. */
export function clearOrgContextCache(): void {
  cache.clear();
}
`;

const targets = [];

for (const entry of readdirSync(join(repoRoot, 'services'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const srcDir = join(repoRoot, 'services', entry.name, 'src');
  try {
    if (!statSync(srcDir).isDirectory()) continue;
  } catch {
    continue;
  }
  targets.push(srcDir);
}

targets.push(join(repoRoot, 'scripts', 'service-template', 'src'));

for (const srcDir of targets) {
  const roleTarget = join(srcDir, 'lib', 'roles.ts');
  mkdirSync(dirname(roleTarget), { recursive: true });
  writeFileSync(roleTarget, header + source, 'utf8');
  console.log(`wrote ${roleTarget.replace(repoRoot + '\\', '')}`);

  const orgTarget = join(srcDir, 'lib', 'org-context.ts');
  writeFileSync(orgTarget, header + orgContextSource, 'utf8');
  console.log(`wrote ${orgTarget.replace(repoRoot + '\\', '')}`);
}
