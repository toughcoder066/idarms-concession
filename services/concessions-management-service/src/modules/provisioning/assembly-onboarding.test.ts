import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma';
import {
  ASSEMBLY_PROJECT_GRANT_ROLE_KEYS,
  OnboardingError,
  onboardAssembly,
  resolveOnboardingActorRole,
} from './assembly-onboarding';
import type { ZitadelProvisioningClient } from './zitadel-client';

const assemblyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const concessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const projectId = 'project-1';
const croipAssemblyId = 'croip-asm-1';
const concessionOrgId = 'concession-org-1';
// The concession org owns the iDARMS project (ADR-0003).
const projectOwnerOrgId = concessionOrgId;
const assemblyName = 'Accra Metropolitan Assembly';
const firstAdmin = { email: 'admin@assembly.local', firstName: 'Ada', lastName: 'Admin' };

interface FakePrismaOptions {
  failRegistry?: boolean;
  /** No CONCESSION-scoped org registered for the concession. */
  noConcessionOrg?: boolean;
}

function createFakePrisma(options: FakePrismaOptions = {}) {
  const state = {
    assembly: {
      id: assemblyId,
      assemblyCode: 'AMA',
      assemblyName,
      zitadelOrgId: null as string | null,
      croipAssemblyId: croipAssemblyId as string | null,
    },
    registry: new Map<string, any>(),
    // The CONCESSION-scoped org, kept apart from the assembly rows the tests count.
    concessionOrg: options.noConcessionOrg ? null : {
      orgId: concessionOrgId, concessionId, assemblyId: null, scope: 'CONCESSION', status: 'ACTIVE',
    },
    onboarding: new Map<string, any>(),
    audits: [] as any[],
  };

  const prisma: any = {
    assembly: {
      findUnique: async ({ where }: any) =>
        (where.id === state.assembly.id
          ? { ...state.assembly, concessions: [{ concessionId }] }
          : null),
      findFirst: async ({ where }: any) =>
        (where.zitadelOrgId && state.assembly.zitadelOrgId === where.zitadelOrgId
          ? { ...state.assembly }
          : null),
      update: async ({ where, data }: any) => {
        if (where.id !== state.assembly.id) throw new Error('assembly not found');
        Object.assign(state.assembly, data);
        return { ...state.assembly };
      },
      updateMany: async ({ where, data }: any) => {
        const matches = where.id === state.assembly.id
          && (!('zitadelOrgId' in where) || state.assembly.zitadelOrgId === where.zitadelOrgId);
        if (!matches) return { count: 0 };
        Object.assign(state.assembly, data);
        return { count: 1 };
      },
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return ids.includes(state.assembly.id)
          ? [{
            id: state.assembly.id,
            assemblyName: state.assembly.assemblyName,
            assemblyCode: state.assembly.assemblyCode,
          }]
          : [];
      },
    },
    zitadelOrgContext: {
      findUnique: async ({ where }: any) => {
        if (where.orgId) return state.registry.get(where.orgId) ?? null;
        if (where.assemblyId) {
          return [...state.registry.values()].find((row) => row.assemblyId === where.assemblyId) ?? null;
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        const row = state.concessionOrg;
        return row && Object.entries(where).every(([key, value]) => (row as any)[key] === value) ? row : null;
      },
      findMany: async ({ where }: any) => [...state.registry.values()].filter((row) =>
        (!where?.scope || row.scope === where.scope)
        && (!where?.status || row.status === where.status)
        && (!where?.assemblyId?.not || row.assemblyId !== null)),
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const [orgId, row] of state.registry) {
          if (row.assemblyId === where.assemblyId) {
            state.registry.delete(orgId);
            count += 1;
          }
        }
        return { count };
      },
      upsert: async ({ where, create, update }: any) => {
        if (options.failRegistry) throw new Error('registry write failed');
        const existing = state.registry.get(where.orgId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { ...create, createdAt: new Date(), updatedAt: new Date() };
        state.registry.set(where.orgId, row);
        return row;
      },
    },
    assemblyOnboarding: {
      findUnique: async ({ where }: any) => state.onboarding.get(where.assemblyId) ?? null,
      deleteMany: async ({ where }: any) => ({
        count: state.onboarding.delete(where.assemblyId) ? 1 : 0,
      }),
      create: async ({ data }: any) => {
        if (state.onboarding.has(data.assemblyId)) throw new Error('unique constraint');
        const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
        state.onboarding.set(data.assemblyId, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = state.onboarding.get(where.assemblyId);
        if (!row) throw new Error('onboarding not found');
        Object.assign(row, data);
        row.updatedAt = new Date();
        return row;
      },
    },
    auditRecord: {
      create: async ({ data }: any) => {
        state.audits.push(data);
        return data;
      },
    },
    staffMember: {
      upsert: async ({ create }: any) => create,
    },
    $transaction: async (fn: any) => fn(prisma),
  };

  return { prisma: prisma as PrismaClient, state };
}

interface FakeZitadelOptions {
  failAt?: 'createOrganization' | 'ensureProjectGrant' | 'superAdminGrant' | 'adminGrant' | 'inviteHumanUser' | 'deleteOrganization';
  failures?: number;
  superAdmins?: string[];
  orphan?: { orgId: string; name: string; primaryDomain?: string } | null;
}

function createFakeZitadel(options: FakeZitadelOptions = {}) {
  const calls: Array<{ method: string; args: any }> = [];
  let counter = 0;
  let failuresRemaining = options.failures ?? Number.POSITIVE_INFINITY;
  const shouldFail = (kind: NonNullable<FakeZitadelOptions['failAt']>): boolean => {
    if (options.failAt !== kind || failuresRemaining <= 0) return false;
    failuresRemaining -= 1;
    return true;
  };

  const client: ZitadelProvisioningClient = {
    createOrganization: vi.fn(async (name: string) => {
      calls.push({ method: 'createOrganization', args: name });
      if (shouldFail('createOrganization')) throw new Error('create failed');
      counter += 1;
      return { orgId: `org-${counter}`, name, primaryDomain: `org-${counter}.localhost` };
    }),
    getOrganization: vi.fn(async (orgId: string) => ({
      orgId,
      name: assemblyName,
      primaryDomain: `${orgId}.localhost`,
    })),
    findOrganizationByName: vi.fn(async () => options.orphan ?? null),
    getDefaultOrganization: vi.fn(async () => ({ orgId: 'org-zitadel-default', name: 'ZITADEL' })),
    deleteOrganization: vi.fn(async (orgId: string) => {
      calls.push({ method: 'deleteOrganization', args: orgId });
      if (shouldFail('deleteOrganization')) throw new Error('delete failed');
    }),
    ensureProjectGrant: vi.fn(async (input: any) => {
      calls.push({ method: 'ensureProjectGrant', args: input });
      if (shouldFail('ensureProjectGrant')) throw new Error('project grant failed');
      return 'grant-1';
    }),
    listUserGrants: vi.fn(async () => []),
    addUserGrant: vi.fn(async (input: any) => {
      calls.push({ method: 'addUserGrant', args: input });
      if (input.roleKeys.includes('CONCESSION_SUPER_ADMIN') && shouldFail('superAdminGrant')) {
        throw new Error('super admin grant failed');
      }
      if (input.roleKeys.includes('ASSEMBLY_ADMIN') && shouldFail('adminGrant')) {
        throw new Error('assembly admin grant failed');
      }
    }),
    listProjectRoleHolders: vi.fn(async () =>
      (options.superAdmins ?? ['super-1', 'super-2']).map((userId) => ({
        id: `grant-${userId}`,
        userId,
        roleKeys: ['CONCESSION_SUPER_ADMIN'],
        orgId: concessionOrgId,
        projectId,
      }))),
    inviteHumanUser: vi.fn(async () => {
      calls.push({ method: 'inviteHumanUser', args: undefined });
      if (shouldFail('inviteHumanUser')) throw new Error('invite failed');
      return { userId: 'admin-user-1', userName: firstAdmin.email };
    }),
    findUserByEmail: vi.fn(async () => null),
  };

  return { client, calls };
}

function makeDeps(options: {
  prisma?: FakePrismaOptions;
  zitadel?: FakeZitadelOptions;
  invalidateThrows?: boolean;
} = {}) {
  const { prisma, state } = createFakePrisma(options.prisma);
  const { client, calls } = createFakeZitadel(options.zitadel);
  const invalidate = vi.fn((_userIds: readonly string[]) => {
    if (options.invalidateThrows) throw new Error('cache invalidation failed');
  });
  const audit = vi.fn(async (entry: any) => {
    await prisma.auditRecord.create({ data: entry });
  });

  return {
    deps: {
      prisma,
      zitadel: client,
      config: { projectId, projectOwnerOrgId },
      isAssigned: async (id: string) => id === croipAssemblyId,
      audit,
      invalidateAccessDirectory: invalidate,
    },
    state,
    calls,
    invalidate,
  };
}

function actor(role = 'CONCESSION_SUPER_ADMIN') {
  return {
    actorId: 'actor-1',
    actorRole: role,
    requestId: 'request-1',
    expectedConcessionId: concessionId,
    concessionAuthorized: true,
  };
}

describe('onboardAssembly', () => {
  it('provisions the org, project grant, every super admin, the first admin, and the registry row', async () => {
    const { deps, state, calls, invalidate } = makeDeps();

    const result = await onboardAssembly(deps, {
      assemblyId,
      firstAdmin,
      actor: actor(),
    });

    expect(result).toMatchObject({
      assemblyId,
      orgId: 'org-1',
      primaryDomain: 'org-1.localhost',
      status: 'ACTIVE',
      superAdminIds: ['super-1', 'super-2'],
      firstAdminUserId: 'admin-user-1',
      alreadyProvisioned: false,
    });

    const projectGrant = calls.find((call) => call.method === 'ensureProjectGrant');
    expect(projectGrant?.args).toMatchObject({
      projectOwnerOrgId,
      projectId,
      grantedOrgId: 'org-1',
    });
    expect(projectGrant?.args.roleKeys).toEqual(expect.arrayContaining([...ASSEMBLY_PROJECT_GRANT_ROLE_KEYS]));

    const superAdminGrants = calls.filter(
      (call) => call.method === 'addUserGrant' && call.args.roleKeys.includes('CONCESSION_SUPER_ADMIN'),
    );
    expect(superAdminGrants.map((call) => call.args.userId)).toEqual(['super-1', 'super-2']);
    expect(superAdminGrants.every((call) => call.args.orgId === 'org-1')).toBe(true);

    expect(calls.some(
      (call) => call.method === 'addUserGrant'
        && call.args.userId === 'admin-user-1'
        && call.args.roleKeys.includes('ASSEMBLY_ADMIN'),
    )).toBe(true);

    expect(state.registry.get('org-1')).toMatchObject({
      orgId: 'org-1',
      concessionId,
      assemblyId,
      scope: 'ASSEMBLY',
      primaryDomain: 'org-1.localhost',
      status: 'ACTIVE',
    });
    expect(state.assembly.zitadelOrgId).toBe('org-1');
    expect(state.onboarding.get(assemblyId)?.status).toBe('ACTIVE');
    expect(invalidate).toHaveBeenCalledWith(['super-1', 'super-2']);

    const actions = state.audits.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining([
      'assembly.onboarding.started',
      'assembly.onboarding.org.created',
      'assembly.onboarding.project.granted',
      'assembly.onboarding.super_admins.granted',
      'assembly.onboarding.admin.invited',
      'assembly.onboarding.registry.written',
      'assembly.onboarding.completed',
    ]));
  });

  it('rolls back the created org when the project grant fails', async () => {
    const { deps, state, calls } = makeDeps({ zitadel: { failAt: 'ensureProjectGrant' } });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', statusCode: 502, rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(0);
    expect(state.onboarding.get(assemblyId)?.status).toBe('ROLLED_BACK');
    expect(state.audits.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      'assembly.onboarding.failed',
      'assembly.onboarding.rolled_back',
    ]));
  });

  it('rolls back when granting a super admin fails', async () => {
    const { deps, state, calls } = makeDeps({ zitadel: { failAt: 'superAdminGrant' } });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(0);
    expect(state.onboarding.get(assemblyId)?.status).toBe('ROLLED_BACK');
  });

  it('rolls back when the first admin invite fails', async () => {
    const { deps, state, calls } = makeDeps({ zitadel: { failAt: 'inviteHumanUser' } });

    await expect(onboardAssembly(deps, { assemblyId, firstAdmin, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(0);
    expect(state.onboarding.get(assemblyId)?.status).toBe('ROLLED_BACK');
  });

  it('rolls back when granting the first admin fails', async () => {
    const { deps, state, calls } = makeDeps({ zitadel: { failAt: 'adminGrant' } });

    await expect(onboardAssembly(deps, { assemblyId, firstAdmin, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(0);
  });

  it('rolls back when writing the registry row fails', async () => {
    const { deps, state, calls } = makeDeps({ prisma: { failRegistry: true } });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(0);
    expect(state.onboarding.get(assemblyId)?.status).toBe('ROLLED_BACK');
  });

  it('rolls back when Access Directory cache invalidation fails', async () => {
    const { deps, state, calls } = makeDeps({ invalidateThrows: true });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(0);
  });

  it('does not create an org to delete when org creation itself fails', async () => {
    const { deps, state, calls } = makeDeps({ zitadel: { failAt: 'createOrganization' } });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization')).toBe(false);
    expect(state.registry.size).toBe(0);
    expect(state.onboarding.get(assemblyId)?.status).toBe('ROLLED_BACK');
  });

  it('rolls back when an intermediate audit write fails', async () => {
    const { deps, state, calls } = makeDeps();
    let auditCalls = 0;
    deps.audit = vi.fn(async () => {
      auditCalls += 1;
      if (auditCalls === 3) throw new Error('audit write failed');
    });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: true });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(0);
    expect(state.onboarding.get(assemblyId)?.status).toBe('ROLLED_BACK');
  });

  it('marks the attempt FAILED and keeps the registry row when ZITADEL rollback deletion fails', async () => {
    const { deps, state, calls } = makeDeps({
      invalidateThrows: true,
      zitadel: { failAt: 'deleteOrganization' },
    });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'onboarding_failed', rolledBack: false });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'org-1')).toBe(true);
    expect(state.registry.size).toBe(1);
    expect(state.onboarding.get(assemblyId)?.status).toBe('FAILED');
    expect(state.audits.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      'assembly.onboarding.rollback_failed',
    ]));
  });

  it('restarts cleanly after a partial failure without creating a duplicate org', async () => {
    const { deps, state, calls } = makeDeps({
      zitadel: { failAt: 'ensureProjectGrant', failures: 1 },
    });

    await expect(onboardAssembly(deps, { assemblyId, actor: actor() })).rejects.toBeInstanceOf(OnboardingError);

    const retry = await onboardAssembly(deps, { assemblyId, actor: actor() });

    expect(retry.orgId).toBe('org-2');
    expect(retry.alreadyProvisioned).toBe(false);
    expect(state.registry.size).toBe(1);
    expect(state.onboarding.get(assemblyId)?.status).toBe('ACTIVE');
    expect([...state.registry.keys()]).toEqual(['org-2']);
    expect(calls.filter((call) => call.method === 'createOrganization')).toHaveLength(2);
    expect(calls.filter((call) => call.method === 'deleteOrganization').map((call) => call.args))
      .toEqual(['org-1', 'org-1']);
  });

  it('returns the existing provisioning on a repeat call', async () => {
    const { deps, state, calls } = makeDeps();

    const first = await onboardAssembly(deps, { assemblyId, actor: actor() });
    calls.length = 0;

    const second = await onboardAssembly(deps, { assemblyId, actor: actor() });

    expect(second).toMatchObject({
      orgId: first.orgId,
      alreadyProvisioned: true,
      superAdminIds: ['super-1', 'super-2'],
    });
    expect(calls.some((call) => call.method === 'createOrganization')).toBe(false);
    expect(state.registry.size).toBe(1);
  });

  it('cleans up an orphan organization found by name after a crash before persistence', async () => {
    const { prisma, state } = createFakePrisma();
    const { client, calls } = createFakeZitadel({
      orphan: { orgId: 'orphan-1', name: assemblyName, primaryDomain: 'orphan.localhost' },
    });
    state.onboarding.set(assemblyId, {
      assemblyId,
      concessionId,
      assemblyName,
      status: 'ORG_CREATED',
      orgId: null,
      attempts: 1,
    });
    const deps = {
      prisma,
      zitadel: client,
      config: { projectId, projectOwnerOrgId },
      isAssigned: async (id: string) => id === croipAssemblyId,
      audit: async () => undefined,
      invalidateAccessDirectory: () => undefined,
    };

    const result = await onboardAssembly(deps, { assemblyId, actor: actor() });

    expect(calls.some((call) => call.method === 'deleteOrganization' && call.args === 'orphan-1')).toBe(true);
    expect(result.orgId).toBe('org-1');
    expect(state.registry.size).toBe(1);
  });

  it('rejects callers below CONCESSION_SUPER_ADMIN without touching ZITADEL', async () => {
    for (const role of ['FIELD_AGENT', 'ASSEMBLY_ADMIN', 'FIELD_OPS_MANAGER']) {
      const { deps, calls } = makeDeps();
      await expect(onboardAssembly(deps, { assemblyId, actor: actor(role) }))
        .rejects.toMatchObject({ code: 'forbidden', statusCode: 403 });
      expect(calls).toHaveLength(0);
    }
  });

  it('rejects a super admin who is not signed in at concession level without touching ZITADEL', async () => {
    const { deps, calls } = makeDeps();
    await expect(onboardAssembly(deps, {
      assemblyId,
      actor: { ...actor(), concessionAuthorized: false },
    })).rejects.toMatchObject({ code: 'forbidden', statusCode: 403 });
    expect(calls).toHaveLength(0);
  });

  it('refuses to onboard until the concession org is registered, without touching ZITADEL', async () => {
    const { deps, calls } = makeDeps({ prisma: { noConcessionOrg: true } });
    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'concession_org_unregistered', statusCode: 409 });
    expect(calls).toHaveLength(0);
  });

  it('refuses an assembly that is not on the active assigned list, without touching ZITADEL', async () => {
    const { deps, calls, state } = makeDeps();
    deps.isAssigned = async () => false;
    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'assembly_not_assigned', statusCode: 409 });
    expect(calls).toHaveLength(0);
    expect(state.registry.size).toBe(0);
  });

  it('refuses an assembly with no CROIP assembly id', async () => {
    const { deps, calls, state } = makeDeps();
    state.assembly.croipAssemblyId = null;
    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'assembly_not_assigned', statusCode: 409 });
    expect(calls).toHaveLength(0);
  });

  it('fails closed when the assigned list cannot be read', async () => {
    const { deps, calls } = makeDeps();
    deps.isAssigned = async () => { throw new Error('connection refused'); };
    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'assignment_check_unavailable', statusCode: 503 });
    expect(calls).toHaveLength(0);
  });

  it('refuses when the project owner is not the registered concession org', async () => {
    const { deps, calls } = makeDeps();
    deps.config = { projectId, projectOwnerOrgId: 'zitadel-default-org' };
    await expect(onboardAssembly(deps, { assemblyId, actor: actor() }))
      .rejects.toMatchObject({ code: 'project_owner_mismatch', statusCode: 503 });
    expect(calls).toHaveLength(0);
  });

  it('looks up super admins in the concession org', async () => {
    const { deps } = makeDeps();
    await onboardAssembly(deps, { assemblyId, firstAdmin, actor: actor() });
    expect(deps.zitadel.listProjectRoleHolders).toHaveBeenCalledWith(expect.objectContaining({ orgId: concessionOrgId }));
  });

  it('rejects a concurrent onboarding attempt instead of creating a duplicate org', async () => {
    const { deps, state } = makeDeps();
    const results = await Promise.allSettled([
      onboardAssembly(deps, { assemblyId, actor: actor() }),
      onboardAssembly(deps, { assemblyId, actor: actor() }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'onboarding_in_progress', statusCode: 409 });
    expect(state.registry.size).toBe(1);
  });

  it('resolves only CONCESSION_SUPER_ADMIN, PLATFORM_ADMIN, and the configured platform admin identity', () => {
    expect(resolveOnboardingActorRole({ subject: 'u1', roles: ['CONCESSION_SUPER_ADMIN'] }, {}))
      .toBe('CONCESSION_SUPER_ADMIN');
    expect(resolveOnboardingActorRole({ subject: 'u1', roles: ['PLATFORM_ADMIN'] }, {}))
      .toBe('PLATFORM_ADMIN');
    expect(resolveOnboardingActorRole({ subject: 'platform-user', roles: [] }, { platformAdminUserId: 'platform-user' }))
      .toBe('PLATFORM_ADMIN');
    expect(resolveOnboardingActorRole({ subject: 'u1', roles: ['ASSEMBLY_ADMIN'] }, {}))
      .toBeNull();
  });
});
