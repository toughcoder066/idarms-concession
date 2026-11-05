import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from '../concessions/audit';

/**
 * Registers the dedicated CONCESSION-scoped ZITADEL org in the org registry
 * (ADR-0003): scope CONCESSION, our concession id, no assembly. It is the home
 * org of concession-wide users such as the Concession Super Admin.
 *
 * The same org owns the iDARMS project and grants it to the assembly orgs.
 *
 * Refuses, and writes nothing, when:
 *   - the configured ZITADEL default org differs from ZITADEL's actual default org,
 *     or (in production) the actual one could not be checked;
 *   - the org is ZITADEL's default org, which is identity infrastructure only;
 *   - the concession does not exist here;
 *   - the registry already maps any org to a different concession (iDARMS runs one concession);
 *   - the org is already registered as an assembly org;
 *   - a different org is already registered as this concession's org (no duplicates).
 * Running it again with the same org is a no-op.
 */

export class ConcessionOrgRegistrationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ConcessionOrgRegistrationError';
  }
}

export interface RegisterConcessionOrgInput {
  orgId: string;
  concessionId: string;
  /** ZITADEL's default org (ZITADEL_DEFAULT_ORG_ID); required so it is never registered. */
  defaultOrgId: string;
  /** ZITADEL's actual default org, read from ZITADEL; undefined when it could not be read. */
  actualDefaultOrgId?: string;
  /** Production: refuse unless actualDefaultOrgId was read. */
  requireVerifiedDefaultOrg?: boolean;
  primaryDomain?: string;
  actorId: string;
  requestId: string;
  /** false = dry run: report what would happen, write nothing. */
  apply: boolean;
}

export interface RegisterConcessionOrgResult {
  action: 'create' | 'reactivate' | 'unchanged';
  applied: boolean;
  orgId: string;
  concessionId: string;
}

const ZITADEL_ID = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(message: string, code: string): never {
  throw new ConcessionOrgRegistrationError(message, code);
}

export async function registerConcessionOrg(
  prisma: PrismaClient,
  input: RegisterConcessionOrgInput,
): Promise<RegisterConcessionOrgResult> {
  const { orgId, concessionId, defaultOrgId, actualDefaultOrgId } = input;
  if (!ZITADEL_ID.test(orgId)) refuse(`--org-id must be a numeric ZITADEL org id, got "${orgId}".`, 'invalid_org_id');
  if (!ZITADEL_ID.test(defaultOrgId)) {
    refuse('The ZITADEL default org id is required (ZITADEL_DEFAULT_ORG_ID or --default-org-id).', 'default_org_unknown');
  }
  if (actualDefaultOrgId !== undefined && actualDefaultOrgId !== defaultOrgId) {
    refuse(`ZITADEL_DEFAULT_ORG_ID is ${defaultOrgId}, but ZITADEL's default org is ${actualDefaultOrgId}. Fix the setting first.`, 'default_org_mismatch');
  }
  if (actualDefaultOrgId === undefined && input.requireVerifiedDefaultOrg) {
    refuse('Could not read the ZITADEL default org to check ZITADEL_DEFAULT_ORG_ID.', 'default_org_unverified');
  }
  if (!UUID.test(concessionId)) refuse(`--concession-id must be a UUID, got "${concessionId}".`, 'invalid_concession_id');
  if (orgId === defaultOrgId) {
    refuse(`Org ${orgId} is ZITADEL's default org. It is identity infrastructure only; use the dedicated iDARMS Concession org.`, 'default_org');
  }

  const concession = await prisma.concessionContract.findUnique({ where: { id: concessionId }, select: { id: true } });
  if (!concession) refuse(`Concession ${concessionId} does not exist in this service.`, 'concession_not_found');

  const foreign = await prisma.zitadelOrgContext.findFirst({
    where: { concessionId: { not: concessionId } },
    select: { orgId: true, concessionId: true },
  });
  if (foreign) {
    refuse(`The registry already maps org ${foreign.orgId} to concession ${foreign.concessionId}. iDARMS runs one concession.`, 'other_concession_registered');
  }

  const existing = await prisma.zitadelOrgContext.findUnique({ where: { orgId } });
  if (existing && existing.scope !== 'CONCESSION') {
    refuse(`Org ${orgId} is already registered as an ${existing.scope} org.`, 'org_registered_as_assembly');
  }

  const current = await prisma.zitadelOrgContext.findFirst({
    where: { concessionId, scope: 'CONCESSION' },
    select: { orgId: true },
  });
  if (current && current.orgId !== orgId) {
    refuse(`Concession ${concessionId} already has concession org ${current.orgId}. Not registering a second one.`, 'concession_org_exists');
  }

  const action: RegisterConcessionOrgResult['action'] = !existing
    ? 'create'
    : existing.status === 'ACTIVE' ? 'unchanged' : 'reactivate';
  const result = { action, applied: false, orgId, concessionId };
  if (!input.apply || action === 'unchanged') return result;

  await prisma.$transaction(async (tx) => {
    await tx.zitadelOrgContext.upsert({
      where: { orgId },
      create: {
        orgId,
        concessionId,
        assemblyId: null,
        scope: 'CONCESSION',
        primaryDomain: input.primaryDomain ?? null,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE', ...(input.primaryDomain ? { primaryDomain: input.primaryDomain } : {}) },
    });
    await writeAudit(tx, {
      actorId: input.actorId,
      actorRole: 'OPERATOR',
      concessionId,
      action: action === 'create' ? 'org_registry.concession_org_registered' : 'org_registry.concession_org_reactivated',
      resourceType: 'zitadel_org_context',
      resourceId: orgId,
      requestId: input.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Registered ZITADEL org ${orgId} as the CONCESSION org of concession ${concessionId}.`,
      metadata: { scope: 'CONCESSION', assemblyId: null },
    });
  });
  return { ...result, applied: true };
}
