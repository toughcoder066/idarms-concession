// Exports the local first-instance ZITADEL admin machine key from the Docker
// volume into a gitignored .secrets/ file for local service use only.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = execSync(
  'docker run --rm -v idarms-zitadel_zitadel-bootstrap:/data:ro alpine cat /data/admin-sa.json',
  { encoding: 'utf8' },
);
const dir = join(root, '.secrets');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'zitadel-admin-sa.json'), raw, { mode: 0o600 });
console.log(`wrote ${join(dir, 'zitadel-admin-sa.json')}`);
