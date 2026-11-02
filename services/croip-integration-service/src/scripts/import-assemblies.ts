import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { AssemblyImportError, importAssignedAssemblies } from '../modules/assemblies/import';

/**
 * Operator command: load the concession's assigned assemblies from a JSON file, the
 * full current list as CROIP shows it. Stand-in until CROIP exposes assignments (G1).
 *
 *   pnpm --filter @idarms/croip-integration-service assemblies:import <file.json> --actor <name>
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filePath = args.find((arg) => !arg.startsWith('--'));
  const actorIndex = args.indexOf('--actor');
  const actorId = actorIndex >= 0 ? args[actorIndex + 1] : undefined;
  if (!filePath || !actorId) {
    console.error('usage: assemblies:import <file.json> --actor <who is importing>');
    process.exit(2);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Cannot read ${filePath} as JSON: ${(err as Error).message}`);
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const result = await importAssignedAssemblies(prisma, raw, {
      concessionId: config.concessionId,
      actorId,
      requestId: randomUUID(),
    });
    console.log(JSON.stringify({
      importVersion: result.importVersion,
      created: result.create.map((entry) => entry.code),
      updated: result.update.map((entry) => entry.code),
      removed: result.remove,
      unchanged: result.unchanged.length,
    }, null, 2));
  } catch (err) {
    if (err instanceof AssemblyImportError) {
      console.error(err.message);
      for (const issue of err.issues) console.error(`  - ${issue}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[assemblies:import] failed', err);
  process.exit(1);
});
