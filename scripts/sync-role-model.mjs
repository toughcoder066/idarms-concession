import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(repoRoot, 'packages', 'contracts', 'src', 'roles.ts');
const source = readFileSync(sourcePath, 'utf8');
const header = [
  '// Generated from packages/contracts/src/roles.ts. Do not edit by hand.',
  '// Run `node scripts/sync-role-model.mjs` after changing the canonical model.',
  '',
].join('\n');

// Shared service files: each is copied to the same path under every service's src/.
const sharedDir = join(repoRoot, 'scripts', 'shared-service-files');
const sharedFiles = ['lib/org-context.ts', 'lib/listen-guard.ts', 'testing/zitadel-test-issuer.ts', 'testing/personas.ts'];
// concessions-management owns the org registry and reads it from its own database,
// so it never gets the HTTP client for it.
const skip = { 'concessions-management-service': ['lib/org-context.ts'] };
const sharedHeader = [
  '// Generated from scripts/shared-service-files. Do not edit by hand.',
  '// Run `node scripts/sync-role-model.mjs` after changing the shared copy.',
  '',
].join('\n');

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

  const serviceName = basename(dirname(srcDir));
  for (const file of sharedFiles) {
    if ((skip[serviceName] ?? []).includes(file)) continue;
    const target = join(srcDir, ...file.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sharedHeader + readFileSync(join(sharedDir, ...file.split('/')), 'utf8'), 'utf8');
    console.log(`wrote ${target.replace(repoRoot + '\\', '')}`);
  }
}
