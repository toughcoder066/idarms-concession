import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

const PREVIEW_READ_ONLY_FILES = [
  'src/app/(portal)/preview/[persona]/page.tsx',
  'src/components/preview/preview-workspace.tsx',
  'src/lib/preview-fixtures.ts',
];

test('preview route, workspace and fixtures never import auth or backend API helpers', async () => {
  for (const file of PREVIEW_READ_ONLY_FILES) {
    const source = await read(file);
    assert.doesNotMatch(
      source,
      /@\/lib\/api|idarmsRequest|\bfetch\s*\(|axios|@\/auth|next-auth|zitadel-client|ZITADEL_/i,
      `${file} must not request auth or backend data while preview mode is active`,
    );
  }
});

test('the only entry call is the dedicated preview audit write', async () => {
  const source = await read('src/app/(portal)/preview/start-actions.ts');
  assert.match(source, /\/preview\/audit/);
  assert.doesNotMatch(source, /\/v1\/(assemblies|staff|concession|access-directory|audit\?)/);
  assert.doesNotMatch(source, /@\/auth|next-auth|ZITADEL|zitadel/);
});

test('preview screen always renders the banner, exit control and disabled controls', async () => {
  const source = await read('src/components/preview/preview-workspace.tsx');
  assert.match(source, /PREVIEW MODE/);
  assert.match(source, /No real data\. Read-only\./);
  assert.match(source, /Exit preview/);
  assert.match(source, /Disabled in preview mode/);
  assert.match(source, /aria-disabled="true"/);
});

test('fixtures are clearly fake and never reference real local assemblies or identities', async () => {
  for (const file of PREVIEW_READ_ONLY_FILES) {
    const source = await read(file);
    assert.doesNotMatch(source, /\bAMA\b|\bLADMA\b|idarms\.local|auth\.idarms\.com/i);
  }

  const source = await read('src/lib/preview-fixtures.ts');
  assert.match(source, /Demo Assembly/);

  const emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  assert.ok(emails.length > 0, 'fixtures must include at least one placeholder identity');
  for (const email of emails) {
    assert.match(email, /@example\.test$/i, `${email} must use the placeholder example.test domain`);
  }
});

test('preview workspace has no navigation into real staff or audit workspaces', async () => {
  const source = await read('src/components/preview/preview-workspace.tsx');
  assert.doesNotMatch(source, /href=.*(staff-access|activity-audit|access-directory|audit-ledger)/);
});
