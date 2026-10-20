// Stops every process started by `pnpm dev:all`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pidFile = join(root, '.dev-pids.json');

if (!existsSync(pidFile)) {
  console.log('Nothing to stop (no .dev-pids.json).');
  process.exit(0);
}

const entries = JSON.parse(readFileSync(pidFile, 'utf8'));
let stopped = 0;

for (const entry of entries) {
  try {
    execFileSync('taskkill', ['/PID', String(entry.pid), '/T', '/F'], { stdio: 'ignore' });
    stopped += 1;
  } catch {
    // already exited
  }
}

rmSync(pidFile, { force: true });
console.log(`Stopped ${stopped} process(es). Infrastructure containers are left running (pnpm db:down).`);
