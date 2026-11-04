import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { ConcessionOrgRegistrationError, registerConcessionOrg } from '../modules/orgs/register-concession-org';

/**
 * Operator command: register the dedicated CONCESSION-scoped ZITADEL org in the
 * org registry (scope CONCESSION, our concession id, no assembly; ADR-0003).
 * Dry run unless --apply is given. In production it also needs --confirm-production.
 *
 *   pnpm --filter @idarms/concessions-management-service org:register-concession \
 *     --org-id <zitadel org id> --concession-id <uuid> --actor <who> [--domain <primary domain>] \
 *     [--infrastructure-org-id <id>] [--apply] [--confirm-production]
 *
 * --sole-concession (local bootstrap only) uses the one concession in this
 * database instead of --concession-id, and refuses if there is not exactly one.
 */
function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const orgId = option(args, '--org-id');
  const actorId = option(args, '--actor');
  const soleConcession = args.includes('--sole-concession');
  let concessionId = option(args, '--concession-id');
  const infrastructureOrgId = option(args, '--infrastructure-org-id') ?? config.zitadelProjectOwnerOrgId ?? '';
  const apply = args.includes('--apply');

  if (!orgId || !actorId || (!concessionId && !soleConcession)) {
    console.error('usage: org:register-concession --org-id <id> (--concession-id <uuid> | --sole-concession) --actor <who> [--apply]');
    process.exit(2);
  }
  if (apply && config.nodeEnv === 'production' && !args.includes('--confirm-production')) {
    console.error('Refusing to write production tenancy data without --confirm-production.');
    process.exit(2);
  }
  if (soleConcession && config.nodeEnv === 'production') {
    console.error('--sole-concession is for local bootstrap only; pass --concession-id explicitly.');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    if (soleConcession) {
      const concessions = await prisma.concessionContract.findMany({ select: { id: true }, take: 2 });
      if (concessions.length !== 1) {
        console.error(`--sole-concession needs exactly one concession; found ${concessions.length}. Pass --concession-id.`);
        process.exitCode = 1;
        return;
      }
      concessionId = concessions[0].id;
    }
    const result = await registerConcessionOrg(prisma, {
      orgId,
      concessionId: concessionId!,
      infrastructureOrgId,
      primaryDomain: option(args, '--domain'),
      actorId,
      requestId: randomUUID(),
      apply,
    });
    console.log(JSON.stringify({ ...result, scope: 'CONCESSION', assemblyId: null, dryRun: !apply }, null, 2));
  } catch (err) {
    if (err instanceof ConcessionOrgRegistrationError) {
      console.error(`Refused (${err.code}): ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[org:register-concession] failed', err);
  process.exit(1);
});
