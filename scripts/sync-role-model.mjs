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

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: OrgContext | null; expiresAt: number }>();

export async function resolveOrgContext(orgId: string): Promise<OrgContext | null> {
  const now = Date.now();
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const base = config.orgContextUrl.replace(/\\/+$/, '');
    const response = await fetch(\`\${base}/v1/org-context/\${encodeURIComponent(orgId)}\`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 404) {
      cache.set(orgId, { value: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    if (!response.ok) return null;
    const value = await response.json() as OrgContext;
    cache.set(orgId, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
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
