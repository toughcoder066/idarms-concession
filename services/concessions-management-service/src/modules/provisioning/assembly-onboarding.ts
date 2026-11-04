import type { PrismaClient } from '../../../generated/prisma';
import { canManageRole, canManageUserWithRoles, PLATFORM_ADMIN } from '../../lib/roles';
import type { AuditInput } from '../concessions/audit';
import { concessionOrgId } from '../orgs/context';
import {
  isZitadelNotFound,
  type ZitadelProvisioningClient,
} from './zitadel-client';

/**
 * Roles available inside an assembly org's project grant.
 * CONCESSION_SUPER_ADMIN is included because ZITADEL only allows an external
 * user grant for a role that is part of the target org's project grant.
 */
export const ASSEMBLY_ORG_ROLE_KEYS = [
  'ASSEMBLY_ADMIN',
  'FIELD_OPS_MANAGER',
  'FINANCE_OFFICER',
  'SECRETARY',
  'CASHIER',
  'FIELD_AGENT',
  'ASSEMBLY_VIEWER',
] as const;

export const ASSEMBLY_PROJECT_GRANT_ROLE_KEYS = [
  ...ASSEMBLY_ORG_ROLE_KEYS,
  'CONCESSION_SUPER_ADMIN',
] as const;

export interface FirstAdminInput {
  email: string;
  firstName: string;
  lastName: string;
}

export interface OnboardingActor {
  actorId: string;
  actorRole: string;
  actorName?: string;
  actorEmail?: string;
  requestId: string;
  expectedConcessionId?: string;
  /** A Platform Admin, or a Concession Super Admin whose home org is the CONCESSION-scoped org. */
  concessionAuthorized?: boolean;
}

export interface OnboardingConfig {
  projectId: string;
  /** The ZITADEL org that owns the iDARMS project (infrastructure, not a tenant). */
  projectOwnerOrgId: string;
}

export interface OnboardAssemblyDeps {
  prisma: PrismaClient;
  zitadel: ZitadelProvisioningClient;
  config: OnboardingConfig;
  audit: (input: AuditInput) => Promise<void>;
  invalidateAccessDirectory: (userIds: readonly string[]) => void;
}

export interface OnboardAssemblyResult {
  assemblyId: string;
  orgId: string;
  primaryDomain: string | null;
  status: 'ACTIVE';
  superAdminIds: string[];
  firstAdminUserId?: string;
  alreadyProvisioned: boolean;
}

export class OnboardingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 500,
    readonly rolledBack = false,
    readonly auditContext?: {
      assemblyId?: string;
      concessionId?: string;
      assemblyName?: string;
    },
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}

export function resolveOnboardingActorRole(
  auth: { subject: string; roles: readonly string[] },
  config: { platformAdminUserId?: string },
): string | null {
  if (auth.roles.includes('CONCESSION_SUPER_ADMIN')) return 'CONCESSION_SUPER_ADMIN';
  if (auth.roles.includes(PLATFORM_ADMIN)) return PLATFORM_ADMIN;
  if (config.platformAdminUserId && auth.subject === config.platformAdminUserId) return PLATFORM_ADMIN;
  return null;
}

const inFlightOnboardings = new Map<string, Promise<OnboardAssemblyResult>>();

export async function onboardAssembly(
  deps: OnboardAssemblyDeps,
  input: {
    assemblyId: string;
    firstAdmin?: FirstAdminInput;
    actor: OnboardingActor;
  },
): Promise<OnboardAssemblyResult> {
  if (inFlightOnboardings.has(input.assemblyId)) {
    throw new OnboardingError(
      'Onboarding is already in progress for this assembly.',
      'onboarding_in_progress',
      409,
      false,
      { assemblyId: input.assemblyId },
    );
  }
  const run = runOnboardAssembly(deps, input);
  inFlightOnboardings.set(input.assemblyId, run);
  try {
    return await run;
  } finally {
    inFlightOnboardings.delete(input.assemblyId);
  }
}

async function runOnboardAssembly(
  deps: OnboardAssemblyDeps,
  input: {
    assemblyId: string;
    firstAdmin?: FirstAdminInput;
    actor: OnboardingActor;
  },
): Promise<OnboardAssemblyResult> {
  const { prisma, zitadel, config, audit, invalidateAccessDirectory } = deps;
  const { assemblyId, firstAdmin, actor } = input;

  if (!canManageRole(actor.actorRole, 'ASSEMBLY_ADMIN')) {
    throw new OnboardingError('Caller is not allowed to onboard assemblies.', 'forbidden', 403, false, { assemblyId });
  }
  if (firstAdmin && !canManageUserWithRoles(actor.actorRole, ['ASSEMBLY_ADMIN'])) {
    throw new OnboardingError('Caller is not allowed to invite an Assembly Admin.', 'forbidden', 403, false, { assemblyId });
  }

  const assembly = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    include: { concessions: true },
  });
  if (!assembly) {
    throw new OnboardingError('Assembly not found.', 'assembly_not_found', 404, false, { assemblyId });
  }
  const concessionId = assembly.concessions[0]?.concessionId;
  if (!concessionId) {
    throw new OnboardingError('Assembly is not linked to a concession.', 'assembly_not_linked', 409, false, { assemblyId, assemblyName: assembly.assemblyName });
  }
  if (
    actor.expectedConcessionId
    && !assembly.concessions.some((link) => link.concessionId === actor.expectedConcessionId)
  ) {
    throw new OnboardingError(
      'Assembly does not belong to the caller\'s concession.',
      'assembly_out_of_scope',
      403,
      false,
      { assemblyId, concessionId, assemblyName: assembly.assemblyName },
    );
  }
  if (!actor.concessionAuthorized) {
    throw new OnboardingError(
      'Only a Concession Super Admin signed in at concession level can onboard assemblies.',
      'forbidden',
      403,
      false,
      { assemblyId, concessionId, assemblyName: assembly.assemblyName },
    );
  }

  // Concession Super Admins live in the CONCESSION-scoped org; it must be registered first.
  const concessionOrg = await concessionOrgId(prisma, concessionId);
  if (!concessionOrg) {
    throw new OnboardingError(
      'No CONCESSION organisation is registered for this concession. Register it with org:register-concession first.',
      'concession_org_unregistered',
      409,
      false,
      { assemblyId, concessionId, assemblyName: assembly.assemblyName },
    );
  }

  const existingRegistry = await prisma.zitadelOrgContext.findUnique({ where: { assemblyId } });
  if (existingRegistry?.status === 'ACTIVE') {
    const holders = await zitadel.listProjectRoleHolders({
      orgId: concessionOrg,
      projectId: config.projectId,
      role: 'CONCESSION_SUPER_ADMIN',
    });
    return {
      assemblyId,
      orgId: existingRegistry.orgId,
      primaryDomain: existingRegistry.primaryDomain,
      status: 'ACTIVE',
      superAdminIds: [...new Set(holders.map((holder) => holder.userId))],
      alreadyProvisioned: true,
    };
  }

  const existingSaga = await prisma.assemblyOnboarding.findUnique({ where: { assemblyId } });
  const attempts = (existingSaga?.attempts ?? 0) + 1;

  // Clean restart: never begin a new attempt while a prior partial org may exist.
  if (existingSaga?.orgId) {
    try {
      await zitadel.deleteOrganization(existingSaga.orgId);
    } catch (error) {
      throw new OnboardingError(
        `Could not clear prior partial organization ${existingSaga.orgId}: ${errorMessage(error)}`,
        'prior_cleanup_failed',
        502,
      );
    }
  } else if (existingSaga) {
    const orphan = await zitadel.findOrganizationByName(assembly.assemblyName);
    if (orphan) {
      const [registryForOrphan, assemblyForOrphan] = await Promise.all([
        prisma.zitadelOrgContext.findUnique({ where: { orgId: orphan.orgId } }),
        prisma.assembly.findFirst({ where: { zitadelOrgId: orphan.orgId } }),
      ]);
      if (registryForOrphan || assemblyForOrphan) {
        throw new OnboardingError(
          `An organization named "${assembly.assemblyName}" already exists but is not owned by this onboarding.`,
          'orphan_name_collision',
          409,
        );
      }
      try {
        await zitadel.deleteOrganization(orphan.orgId);
      } catch (error) {
        throw new OnboardingError(
          `Could not clear orphaned organization ${orphan.orgId}: ${errorMessage(error)}`,
          'orphan_cleanup_failed',
          502,
        );
      }
    }
  }

  await prisma.zitadelOrgContext.deleteMany({ where: { assemblyId } });
  await prisma.assemblyOnboarding.deleteMany({ where: { assemblyId } });
  if (assembly.zitadelOrgId) {
    await prisma.assembly.update({ where: { id: assemblyId }, data: { zitadelOrgId: null } });
  }

  await prisma.assemblyOnboarding.create({
    data: {
      assemblyId,
      concessionId,
      assemblyName: assembly.assemblyName,
      status: 'PENDING',
      firstAdminEmail: firstAdmin?.email ?? null,
      attempts,
    },
  });

  let orgId: string | undefined;
  let firstAdminUserId: string | undefined;
  let superAdminIds: string[] = [];

  try {
    await auditStep(deps, actor, concessionId, assemblyId, 'started', undefined, 'SUCCESS', {
      message: `Started onboarding ${assembly.assemblyName}.`,
      metadata: { attempt: attempts, assemblyCode: assembly.assemblyCode },
    });

    const org = await zitadel.createOrganization(assembly.assemblyName);
    orgId = org.orgId;
    await prisma.assemblyOnboarding.update({
      where: { assemblyId },
      data: { status: 'ORG_CREATED', orgId, primaryDomain: org.primaryDomain ?? null },
    });
    await auditStep(deps, actor, concessionId, assemblyId, 'org.created', orgId, 'SUCCESS', {
      message: `Created ZITADEL organization ${orgId} for ${assembly.assemblyName}.`,
      metadata: { primaryDomain: org.primaryDomain ?? null },
    });

    await zitadel.ensureProjectGrant({
      projectOwnerOrgId: config.projectOwnerOrgId,
      projectId: config.projectId,
      grantedOrgId: orgId,
      roleKeys: ASSEMBLY_PROJECT_GRANT_ROLE_KEYS,
    });
    await prisma.assemblyOnboarding.update({
      where: { assemblyId },
      data: { status: 'PROJECT_GRANTED' },
    });
    await auditStep(deps, actor, concessionId, assemblyId, 'project.granted', orgId, 'SUCCESS', {
      message: `Granted the iDARMS project to organization ${orgId}.`,
      metadata: { roleKeys: [...ASSEMBLY_PROJECT_GRANT_ROLE_KEYS], projectId: config.projectId },
    });

    const holders = await zitadel.listProjectRoleHolders({
      orgId: concessionOrg,
      projectId: config.projectId,
      role: 'CONCESSION_SUPER_ADMIN',
    });
    superAdminIds = [...new Set(holders.map((holder) => holder.userId))];
    for (const userId of superAdminIds) {
      await zitadel.addUserGrant({
        orgId,
        userId,
        projectId: config.projectId,
        roleKeys: ['CONCESSION_SUPER_ADMIN'],
      });
    }
    await prisma.assemblyOnboarding.update({
      where: { assemblyId },
      data: { status: 'SUPER_ADMINS_GRANTED' },
    });
    await auditStep(deps, actor, concessionId, assemblyId, 'super_admins.granted', orgId, 'SUCCESS', {
      message: `Granted CONCESSION_SUPER_ADMIN to ${superAdminIds.length} existing super admin(s) in ${orgId}.`,
      metadata: { superAdminIds, count: superAdminIds.length },
    });

    if (firstAdmin) {
      const invited = await zitadel.inviteHumanUser({
        orgId,
        email: firstAdmin.email,
        firstName: firstAdmin.firstName,
        lastName: firstAdmin.lastName,
      });
      firstAdminUserId = invited.userId;
      await zitadel.addUserGrant({
        orgId,
        userId: invited.userId,
        projectId: config.projectId,
        roleKeys: ['ASSEMBLY_ADMIN'],
      });
      await prisma.$transaction(async (tx) => {
        await tx.assemblyOnboarding.update({
          where: { assemblyId },
          data: { status: 'ADMIN_INVITED' },
        });
        await tx.assembly.update({
          where: { id: assemblyId },
          data: { adminEmail: firstAdmin.email, adminInvitedAt: new Date() },
        });
        await tx.staffMember.upsert({
          where: {
            assemblyId_userId: {
              assemblyId,
              userId: invited.userId,
            },
          },
          create: {
            assemblyId,
            orgId: orgId!,
            userId: invited.userId,
            email: firstAdmin.email,
            name: `${firstAdmin.firstName} ${firstAdmin.lastName}`.trim(),
            role: 'ASSEMBLY_ADMIN',
            invitedBy: actor.actorId,
            invitedAt: new Date(),
            lastKnownStatus: 'INVITED',
          },
          update: {
            email: firstAdmin.email,
            name: `${firstAdmin.firstName} ${firstAdmin.lastName}`.trim(),
            role: 'ASSEMBLY_ADMIN',
          },
        });
      });
      await auditStep(deps, actor, concessionId, assemblyId, 'admin.invited', orgId, 'SUCCESS', {
        message: `Invited the first Assembly Admin for ${assembly.assemblyName}.`,
        metadata: { userId: invited.userId, email: firstAdmin.email, role: 'ASSEMBLY_ADMIN' },
      });
    }

    const primaryDomain = org.primaryDomain
      ?? (await zitadel.getOrganization(orgId))?.primaryDomain
      ?? null;

    await prisma.$transaction(async (tx) => {
      await tx.zitadelOrgContext.upsert({
        where: { orgId: orgId! },
        create: {
          orgId: orgId!,
          concessionId,
          assemblyId,
          scope: 'ASSEMBLY',
          primaryDomain,
          status: 'ACTIVE',
        },
        update: {
          concessionId,
          assemblyId,
          scope: 'ASSEMBLY',
          primaryDomain,
          status: 'ACTIVE',
        },
      });
      await tx.assembly.update({ where: { id: assemblyId }, data: { zitadelOrgId: orgId! } });
      await tx.assemblyOnboarding.update({
        where: { assemblyId },
        data: { status: 'REGISTRY_WRITTEN', primaryDomain },
      });
    });
    await auditStep(deps, actor, concessionId, assemblyId, 'registry.written', orgId, 'SUCCESS', {
      message: `Registered organization ${orgId} as the assembly tenant for ${assembly.assemblyName}.`,
      metadata: { primaryDomain },
    });

    invalidateAccessDirectory(superAdminIds);

    await prisma.assemblyOnboarding.update({
      where: { assemblyId },
      data: { status: 'ACTIVE', error: null },
    });
    await auditStep(deps, actor, concessionId, assemblyId, 'completed', orgId, 'SUCCESS', {
      message: `Onboarding completed for ${assembly.assemblyName}.`,
      metadata: { superAdminIds, firstAdminUserId: firstAdminUserId ?? null },
    });

    return {
      assemblyId,
      orgId,
      primaryDomain,
      status: 'ACTIVE',
      superAdminIds,
      ...(firstAdminUserId ? { firstAdminUserId } : {}),
      alreadyProvisioned: false,
    };
  } catch (error) {
    const rolledBack = await rollback(deps, assemblyId, orgId);
    const message = errorMessage(error);

    if (rolledBack) {
      try {
        await prisma.zitadelOrgContext.deleteMany({ where: { assemblyId } });
        if (orgId) {
          await prisma.assembly.updateMany({
            where: { id: assemblyId, zitadelOrgId: orgId },
            data: { zitadelOrgId: null },
          });
        }
      } catch {
        // A cleanup write failure must not hide the original provisioning failure.
      }
    }

    await prisma.assemblyOnboarding.update({
      where: { assemblyId },
      data: { status: rolledBack ? 'ROLLED_BACK' : 'FAILED', error: message },
    }).catch(() => undefined);

    await safeAudit(deps, actor, concessionId, assemblyId, 'failed', orgId, 'FAILED', {
      message: `Onboarding failed for ${assembly.assemblyName}: ${message}`,
      metadata: { error: message, rolledBack },
    });
    if (rolledBack) {
      await safeAudit(deps, actor, concessionId, assemblyId, 'rolled_back', orgId, 'ROLLED_BACK', {
        message: `Rolled back organization ${orgId ?? '(not created)'} for ${assembly.assemblyName}.`,
      });
    } else {
      await safeAudit(deps, actor, concessionId, assemblyId, 'rollback_failed', orgId, 'FAILED', {
        message: `Rollback failed for ${assembly.assemblyName}. Manual cleanup is required for ${orgId ?? 'the partial organization'}.`,
        metadata: { error: message },
      });
    }

    throw new OnboardingError(
      `Assembly onboarding failed: ${message}`,
      error instanceof OnboardingError ? error.code : 'onboarding_failed',
      502,
      rolledBack,
    );
  }
}

async function rollback(
  deps: OnboardAssemblyDeps,
  assemblyId: string,
  orgId?: string,
): Promise<boolean> {
  if (!orgId) return true;
  try {
    await deps.zitadel.deleteOrganization(orgId);
    return true;
  } catch (error) {
    if (isZitadelNotFound(error)) return true;
    return false;
  }
}

async function auditStep(
  deps: OnboardAssemblyDeps,
  actor: OnboardingActor,
  concessionId: string,
  assemblyId: string,
  step: string,
  orgId: string | undefined,
  outcome: string,
  detail: { message: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await deps.audit({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    concessionId,
    assemblyId,
    action: `assembly.onboarding.${step}`,
    resourceType: 'ZitadelOrganization',
    resourceId: orgId,
    requestId: actor.requestId,
    outcome,
    humanReadable: detail.message,
    metadata: { step, ...(detail.metadata ?? {}) },
  });
}

async function safeAudit(
  deps: OnboardAssemblyDeps,
  actor: OnboardingActor,
  concessionId: string,
  assemblyId: string,
  step: string,
  orgId: string | undefined,
  outcome: string,
  detail: { message: string; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await auditStep(deps, actor, concessionId, assemblyId, step, orgId, outcome, detail);
  } catch {
    // Audit failure must not hide the original provisioning failure.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
