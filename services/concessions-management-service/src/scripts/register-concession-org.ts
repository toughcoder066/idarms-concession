import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { ConcessionOrgRegistrationError, registerConcessionOrg } from '../modules/orgs/register-concession-org';
import { HttpZitadelProvisioningClient } from '../modules/provisioning/zitadel-client';

/**
 * Operator command: register the dedicated CONCESSION-scoped ZITADEL org in the
 * org registry (scope CONCESSION, our concession id, no assembly; ADR-0003).
 * Dry run unless --apply is given. In production it also needs --confirm-production.
 *
 *   pnpm --filter @idarms/concessions-management-service org:register-concession \
 *     --org-id <zitadel org id> --concession-id <uuid> --actor <who> [--domain <primary domain>] \
 *     [--default-org-id <id>] [--apply] [--confirm-production]
 *
 * ZITADEL's default org (--default-org-id, else ZITADEL_DEFAULT_ORG_ID) is never
 * registered. The command checks it against ZITADEL's actual default org with the
 * provisioning key; in production that check must succeed.
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
  const defaultOrgId = option(args, '--default-org-id') ?? config.zitadelDefaultOrgId ?? '';
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
    const actualDefaultOrgId = await readDefaultOrgId();
    const result = await registerConcessionOrg(prisma, {
      orgId,
      concessionId: concessionId!,
      defaultOrgId,
      actualDefaultOrgId,
      requireVerifiedDefaultOrg: config.nodeEnv === 'production',
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

/** ZITADEL's actual default org, or undefined (with a warning) when it cannot be read. */
async function readDefaultOrgId(): Promise<string | undefined> {
  if (!config.zitadelProvisioningKeyPath) {
    console.warn('No ZITADEL_PROVISIONING_KEY_PATH: ZITADEL_DEFAULT_ORG_ID is not checked against ZITADEL.');
    return undefined;
  }
  try {
    const client = new HttpZitadelProvisioningClient({
      baseUrl: config.zitadelProvisioningUrl,
      keyPath: config.zitadelProvisioningKeyPath,
      timeoutMs: config.zitadelProvisioningTimeoutMs,
    });
    return (await client.getDefaultOrganization())?.orgId;
  } catch (err) {
    console.warn(`Could not read ZITADEL's default org: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

main().catch((err) => {
  console.error('[org:register-concession] failed', err);
  process.exit(1);
});
