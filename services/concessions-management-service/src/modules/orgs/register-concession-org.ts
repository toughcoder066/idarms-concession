import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from '../concessions/audit';

/**
 * Registers the dedicated CONCESSION-scoped ZITADEL org in the org registry
 * (ADR-0003): scope CONCESSION, our concession id, no assembly. It is the home
 * org of concession-wide users such as the Concession Super Admin.
 *
 * Refuses, and writes nothing, when:
 *   - the org is ZITADEL's own infrastructure org (the org that owns the
 *     iDARMS project, normally the instance default org), which is never a tenant;
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
  /** The ZITADEL infrastructure org; required so it can never be registered by mistake. */
  infrastructureOrgId: string;
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
  const { orgId, concessionId, infrastructureOrgId } = input;
  if (!ZITADEL_ID.test(orgId)) refuse(`--org-id must be a numeric ZITADEL org id, got "${orgId}".`, 'invalid_org_id');
  if (!ZITADEL_ID.test(infrastructureOrgId)) {
    refuse('The ZITADEL infrastructure org id is required (ZITADEL_PROJECT_OWNER_ORG_ID or --infrastructure-org-id).', 'infrastructure_org_unknown');
  }
  if (!UUID.test(concessionId)) refuse(`--concession-id must be a UUID, got "${concessionId}".`, 'invalid_concession_id');
  if (orgId === infrastructureOrgId) {
    refuse(`Org ${orgId} is ZITADEL's infrastructure org. It is never an iDARMS tenant; create a dedicated concession org.`, 'infrastructure_org');
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
