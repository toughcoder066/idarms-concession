// Starts local infrastructure plus every iDARMS service and worker.
// Usage: pnpm dev:all
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const logDir = join(root, '.dev-logs');
const pidFile = join(root, '.dev-pids.json');

const databases = [
  'idarms_ratepayer_db',
  'idarms_property_db',
  'idarms_document_db',
  'idarms_valuation_db',
  'idarms_billing_db',
  'idarms_payment_db',
  'idarms_reconciliation_db',
  'idarms_reporting_db',
  'idarms_integration_db',
  'concession_mgmt_db',
  'gis_spatial_db',
];

const servers = [
  ['ratepayer-service', 3020],
  ['property-service', 3010],
  ['documents-service', 3050],
  ['valuation-service', 3060],
  ['billing-service', 3030],
  ['payment-service', 3040],
  ['reconciliation-service', 3070],
  ['reporting-service', 3080],
  ['croip-integration-service', 3090],
  ['concessions-management-service', 3100],
  ['gis-service', 3110],
];
const workers = {
  'ratepayer-service': ['inbox-worker'],
  'property-service': ['inbox-worker', 'outbox-worker'],
  'documents-service': ['inbox-worker', 'outbox-worker'],
  'valuation-service': ['inbox-worker', 'outbox-worker'],
  'billing-service': ['inbox-worker', 'outbox-worker'],
  'payment-service': ['inbox-worker', 'outbox-worker'],
  'reconciliation-service': ['inbox-worker', 'outbox-worker'],
  'reporting-service': ['inbox-worker', 'outbox-worker'],
  'croip-integration-service': ['downstream-worker', 'upstream-worker', 'outbox-worker'],
  'concessions-management-service': ['inbox-worker', 'outbox-worker'],
  'gis-service': ['inbox-worker', 'outbox-worker'],
};

const entries = [];
for (const [service, port] of servers) {
  entries.push({
    name: `${service}-api`,
    cwd: join(root, 'services', service),
    args: ['exec', 'tsx', 'src/server.ts'],
    port,
    probe: '/health/live',
  });
}
for (const [service, list] of Object.entries(workers)) {
  for (const worker of list) {
    entries.push({
      name: `${service}-${worker}`,
      cwd: join(root, 'services', service),
      args: ['exec', 'tsx', `src/workers/${worker}.ts`],
    });
  }
}
entries.push({
  name: 'idarms-portal',
  cwd: join(root, 'apps', 'idarms-portal'),
  args: ['dev'],
  port: 3000,
  probe: '/',
});

function sh(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: true, ...options });
}

console.log('> starting infrastructure (postgres + rabbitmq)');
sh('docker', ['compose', '-f', 'infra/docker/docker-compose.yml', 'up', '-d']);

process.stdout.write('> waiting for postgres to become healthy ');
let healthy = false;
for (let i = 0; i < 40; i += 1) {
  try {
    const status = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', 'idarms-postgres'], {
      encoding: 'utf8',
    }).trim();
    if (status === 'healthy') {
      healthy = true;
      break;
    }
  } catch {
    // container not ready yet
  }
  process.stdout.write('.');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(healthy ? ' ok' : ' (continuing, check `pnpm db:logs`)');

if (healthy) {
  for (const database of databases) {
    try {
      const existing = execFileSync(
        'docker',
        ['exec', 'idarms-postgres', 'psql', '-U', 'idarms', '-d', 'idarms', '-tAc',
          `SELECT 1 FROM pg_database WHERE datname = '${database}'`],
        { encoding: 'utf8' },
      ).trim();
      if (!existing) {
        execFileSync('docker', [
          'exec', 'idarms-postgres', 'psql', '-U', 'idarms', '-d', 'idarms',
          '-c', `CREATE DATABASE ${database}`,
        ]);
        console.log(`  + database ${database}`);
      }
    } catch (error) {
      console.warn(`  ! could not ensure database ${database}: ${error.message}`);
    }
  }
}

mkdirSync(logDir, { recursive: true });
const started = [];

for (const entry of entries) {
  const logPath = join(logDir, `${entry.name}.log`);
  const child = spawn('pnpm', entry.args, {
    cwd: entry.cwd,
    shell: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const chunks = [];
  child.stdout.on('data', (d) => chunks.push(d));
  child.stderr.on('data', (d) => chunks.push(d));
  child.on('exit', (code) => {
    if (code !== 0) {
      writeFileSync(logPath, Buffer.concat(chunks).toString());
      console.warn(`  ! ${entry.name} exited (code ${code}) — see .dev-logs/${entry.name}.log`);
    }
  });

  started.push({ name: entry.name, pid: child.pid, port: entry.port, probe: entry.probe, logPath });
  console.log(`  + ${entry.name}${entry.port ? ` (port ${entry.port})` : ''}`);
}

writeFileSync(pidFile, JSON.stringify(started, null, 2));

// Wait for each HTTP app to answer its probe path.
const apis = started.filter((entry) => entry.port);
process.stdout.write('> waiting for APIs');
let up = 0;
for (let attempt = 0; attempt < 60; attempt += 1) {
  up = 0;
  for (const api of apis) {
    try {
      const res = await fetch(`http://127.0.0.1:${api.port}${api.probe ?? '/'}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) up += 1;
    } catch {
      // not ready
    }
  }
  if (up === apis.length) break;
  process.stdout.write('.');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(` ${up}/${apis.length} ready`);

console.log('\nServers:');
for (const [service, port] of servers) console.log(`  http://localhost:${port}  ${service}`);
console.log('  http://localhost:3000  idarms-portal');
console.log('\nStop everything with: pnpm dev:stop');
console.log('Run the end-to-end check with: pnpm smoke');
