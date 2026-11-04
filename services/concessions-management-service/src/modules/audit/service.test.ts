import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma';
import type { AccessDirectoryEntry } from '../access-directory/service';
import {
  clearAuditActorCache,
  listAssemblyAudit,
  listAssemblyAuditActors,
  listConcessionAudit,
  type AuditDeps,
} from './service';

const AMA = '11111111-1111-1111-1111-111111111111';
const LADMA = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';
const SUPER = 'super-1';
const ADMIN = 'admin-1';

interface AuditRow {
  id: string;
  occurredAt: Date;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  assemblyId: string | null;
  outcome: string;
  metadata: Record<string, unknown>;
}

interface StaffRow {
  userId: string;
  assemblyId: string;
  name: string;
  email: string;
  role: string;
  lastKnownStatus: string;
  invitedAt: Date;
  updatedAt: Date;
}

function matches(row: AuditRow, where: Record<string, any>): boolean {
  if (where.assemblyId) {
    if (typeof where.assemblyId === 'string' && row.assemblyId !== where.assemblyId) return false;
    if (where.assemblyId.in && !where.assemblyId.in.includes(row.assemblyId)) return false;
  }
  if (where.actorId && row.actorId !== where.actorId) return false;
  if (where.action) {
    if (typeof where.action === 'string' && row.action !== where.action) return false;
    if (where.action.startsWith && !row.action.startsWith(where.action.startsWith)) return false;
  }
  if (where.occurredAt?.gte && row.occurredAt < where.occurredAt.gte) return false;
  if (where.occurredAt?.lte && row.occurredAt > where.occurredAt.lte) return false;
  return true;
}

function createPrisma(auditRows: AuditRow[], staffRows: StaffRow[] = []) {
  const auditRecord = {
    findMany: async ({ where, skip = 0, take = 100 }: any) => auditRows
      .filter((row) => matches(row, where))
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(skip, skip + take),
    findFirst: async ({ where }: any) => auditRows
      .filter((row) => matches(row, where))
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0] ?? null,
    count: async ({ where }: any) => auditRows.filter((row) => matches(row, where)).length,
    groupBy: async ({ by, where, _max }: any) => {
      const field = by[0] as 'actorId' | 'assemblyId';
      const groups = new Map<string, AuditRow[]>();
      for (const row of auditRows.filter((item) => matches(item, where))) {
        const key = String(row[field]);
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      return [...groups.entries()].map(([key, rows]) => ({
        [field]: key,
        _count: { _all: rows.length },
        _max: _max?.occurredAt
          ? { occurredAt: new Date(Math.max(...rows.map((row) => row.occurredAt.getTime()))) }
          : {},
      }));
    },
  };
  const staffMember = {
    findFirst: async ({ where }: any) => staffRows.find((row) => (
      row.userId === where.userId
      && (!where.assemblyId || row.assemblyId === where.assemblyId)
    )) ?? null,
    count: async ({ where }: any) => staffRows.filter((row) => (
      (!where.assemblyId?.in || where.assemblyId.in.includes(row.assemblyId))
      && (!where.lastKnownStatus || row.lastKnownStatus === where.lastKnownStatus)
      && (!where.invitedAt?.lt || row.invitedAt < where.invitedAt.lt)
    )).length,
  };
  return {
    auditRecord,
    staffMember,
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  } as unknown as PrismaClient;
}

function createDeps(
  prisma: PrismaClient,
  users: Record<string, { displayName?: string; email?: string }> = {},
): AuditDeps {
  return {
    prisma,
    concessionOrgId: 'concession-org',
    assemblyOrgId: 'ama-org',
    assemblyId: AMA,
    assemblyName: 'Accra Metropolitan Assembly',
    assemblyCode: 'AMA',
    zitadel: {
      getUser: async (orgId: string, userId: string) => {
        const user = users[`${orgId}:${userId}`];
        return user ? {
          userId,
          userName: userId,
          displayName: user.displayName,
          email: user.email,
          state: 'USER_STATE_ACTIVE',
          createdAt: new Date().toISOString(),
        } : null;
      },
    } as any,
  };
}

function row(overrides: Partial<AuditRow> & Pick<AuditRow, 'id' | 'action'>): AuditRow {
  return {
    occurredAt: new Date(),
    actorId: ADMIN,
    resourceType: 'User',
    resourceId: 'target-1',
    assemblyId: AMA,
    outcome: 'SUCCESS',
    metadata: {},
    ...overrides,
  };
}

function accessible(): AccessDirectoryEntry[] {
  return [
    {
      orgId: 'ama-org',
      assemblyId: AMA,
      assemblyName: 'Accra Metropolitan Assembly',
      assemblyCode: 'AMA',
      concessionId: 'concession-1',
      primaryDomain: null,
      role: 'CONCESSION_SUPER_ADMIN',
    },
    {
      orgId: 'ladma-org',
      assemblyId: LADMA,
      assemblyName: 'Ledzokuku Municipal Assembly',
      assemblyCode: 'LADMA',
      concessionId: 'concession-1',
      primaryDomain: null,
      role: 'CONCESSION_SUPER_ADMIN',
    },
  ];
}

beforeEach(() => clearAuditActorCache());

describe('assembly audit queries', () => {
  it('paginates only the requested assembly and returns structured descriptions', async () => {
    const now = Date.now();
    const rows = Array.from({ length: 27 }, (_, index) => row({
      id: `ama-${index}`,
      action: 'staff.invited',
      occurredAt: new Date(now - index * 60_000),
      metadata: {
        email: `person${index}@example.com`,
        role: 'FIELD_AGENT',
        inviteStatus: 'INVITED',
        actorRole: 'ASSEMBLY_ADMIN',
      },
    }));
    rows.push(row({
      id: 'ladma-1',
      action: 'staff.invited',
      assemblyId: LADMA,
      metadata: { email: 'ladma@example.com', role: 'FIELD_AGENT', inviteStatus: 'INVITED', actorRole: 'ASSEMBLY_ADMIN' },
    }));

    const page = await listAssemblyAudit(createDeps(createPrisma(rows)) as AuditDeps & { assemblyId: string; assemblyOrgId: string }, {
      page: 2,
      pageSize: 10,
    });

    expect(page.total).toBe(27);
    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.items.every((item) => item.assemblyId === AMA)).toBe(true);
    expect(page.items[0].description).toContain('Invited person10@example.com as Field Agent');
    expect(page.items[0].actorRole).toBe('ASSEMBLY_ADMIN');
  });

  it('filters by action prefix, actor and date range', async () => {
    const base = Date.parse('2026-10-20T10:00:00.000Z');
    const rows = [
      row({
        id: 'bulk-1',
        action: 'staff.bulk_import.committed',
        actorId: ADMIN,
        occurredAt: new Date(base),
        metadata: { summary: { total: 2, invited: 2, alreadyExists: 0, failed: 0, needsReview: 0 }, actorRole: 'ASSEMBLY_ADMIN' },
      }),
      row({
        id: 'bulk-2',
        action: 'staff.bulk_import.validated',
        actorId: ADMIN,
        occurredAt: new Date(base + 60_000),
        metadata: { actorRole: 'ASSEMBLY_ADMIN' },
      }),
      row({
        id: 'invite-1',
        action: 'staff.invited',
        actorId: ADMIN,
        occurredAt: new Date(base + 120_000),
        metadata: { email: 'invite@example.com', role: 'CASHIER', inviteStatus: 'INVITED', actorRole: 'ASSEMBLY_ADMIN' },
      }),
      row({
        id: 'bulk-other-actor',
        action: 'staff.bulk_import.committed',
        actorId: SUPER,
        occurredAt: new Date(base + 180_000),
        metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' },
      }),
      row({
        id: 'bulk-outside-date',
        action: 'staff.bulk_import.committed',
        actorId: ADMIN,
        occurredAt: new Date(base + 10 * 24 * 60 * 60 * 1000),
        metadata: { actorRole: 'ASSEMBLY_ADMIN' },
      }),
    ];

    const page = await listAssemblyAudit(createDeps(createPrisma(rows)) as AuditDeps & { assemblyId: string; assemblyOrgId: string }, {
      page: 1,
      pageSize: 10,
      actionPrefix: 'staff.bulk_import',
      actorId: ADMIN,
      from: new Date(base - 1000),
      to: new Date(base + 5 * 60_000),
    });

    expect(page.items.map((item) => item.id)).toEqual(['bulk-2', 'bulk-1']);
  });

  it('resolves actor names from staff records and ZITADEL when metadata lacks them', async () => {
    const rows = [
      row({
        id: 'onboarding-1',
        action: 'assembly.onboarding.started',
        actorId: SUPER,
        resourceType: 'ZitadelOrganization',
        metadata: {},
      }),
      row({
        id: 'invite-1',
        action: 'staff.invited',
        actorId: ADMIN,
        metadata: { email: 'person@example.com', role: 'SECRETARY', inviteStatus: 'INVITED' },
      }),
      row({
        id: 'deactivated-1',
        action: 'staff.deactivated',
        actorId: ADMIN,
        resourceId: 'live-agent',
        metadata: { roles: ['FIELD_AGENT'] },
      }),
    ];
    const staffRows: StaffRow[] = [{
      userId: ADMIN,
      assemblyId: AMA,
      name: 'Ama Admin',
      email: 'ama@example.com',
      role: 'ASSEMBLY_ADMIN',
      lastKnownStatus: 'ACTIVE',
      invitedAt: new Date(),
      updatedAt: new Date(),
    }, {
      userId: 'live-agent',
      assemblyId: AMA,
      name: 'Live Agent',
      email: 'live-agent@idarms.local',
      role: 'FIELD_AGENT',
      lastKnownStatus: 'ACTIVE',
      invitedAt: new Date(),
      updatedAt: new Date(),
    }];
    const prisma = createPrisma(rows, staffRows);
    const deps = createDeps(prisma, {
      'concession-org:super-1': { displayName: 'Concession Admin', email: 'super@example.com' },
    }) as AuditDeps & { assemblyId: string; assemblyOrgId: string };

    const page = await listAssemblyAudit(deps, { page: 1, pageSize: 10 });

    const onboarding = page.items.find((item) => item.id === 'onboarding-1');
    expect(onboarding?.actorName).toBe('Concession Admin');
    expect(onboarding?.actorRole).toBe('CONCESSION_SUPER_ADMIN');
    const invite = page.items.find((item) => item.id === 'invite-1');
    expect(invite?.actorName).toBe('Ama Admin');
    expect(invite?.actorRole).toBe('ASSEMBLY_ADMIN');
    const deactivated = page.items.find((item) => item.id === 'deactivated-1');
    expect(deactivated?.description).toBe('Deactivated live-agent@idarms.local in Accra Metropolitan Assembly.');
  });

  it('returns distinct actor options with counts', async () => {
    const rows = [
      row({ id: 'a1', action: 'staff.invited', actorId: ADMIN, metadata: { actorRole: 'ASSEMBLY_ADMIN' } }),
      row({ id: 'a2', action: 'staff.invited', actorId: ADMIN, metadata: { actorRole: 'ASSEMBLY_ADMIN' } }),
      row({ id: 'a3', action: 'staff.invited', actorId: SUPER, metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' } }),
    ];
    const actors = await listAssemblyAuditActors(
      createDeps(createPrisma(rows)) as AuditDeps & { assemblyId: string; assemblyOrgId: string },
      { page: 1, pageSize: 10 },
    );
    expect(actors).toHaveLength(2);
    expect(actors.find((actor) => actor.actorId === ADMIN)?.actionCount).toBe(2);
    expect(actors.find((actor) => actor.actorId === SUPER)?.role).toBe('CONCESSION_SUPER_ADMIN');
  });
});

describe('concession audit queries', () => {
  it('queries only accessible assemblies and the caller actions, with facets and summary', async () => {
    const now = Date.now();
    const rows = [
      row({ id: 'ama-1', action: 'staff.invited', actorId: SUPER, occurredAt: new Date(now - 60_000), metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' } }),
      row({ id: 'ladma-1', action: 'staff.role_changed', actorId: SUPER, assemblyId: LADMA, occurredAt: new Date(now - 120_000), metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' } }),
      row({ id: 'other-actor', action: 'staff.invited', actorId: ADMIN, metadata: { actorRole: 'ASSEMBLY_ADMIN' } }),
      row({ id: 'other-assembly', action: 'staff.invited', actorId: SUPER, assemblyId: OTHER, metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' } }),
    ];
    const staffRows: StaffRow[] = [{
      userId: 'old-invite',
      assemblyId: AMA,
      name: 'Old Invite',
      email: 'old@example.com',
      role: 'FIELD_AGENT',
      lastKnownStatus: 'INVITED',
      invitedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    }];
    const deps = {
      ...createDeps(createPrisma(rows, staffRows)),
      actorId: SUPER,
      accessibleAssemblies: accessible(),
    };

    const page = await listConcessionAudit(deps, { page: 1, pageSize: 10 });

    expect(page.items.map((item) => item.id)).toEqual(['ama-1', 'ladma-1']);
    expect(page.total).toBe(2);
    expect(page.assemblies).toHaveLength(2);
    expect(page.assemblies.find((assembly) => assembly.assemblyId === AMA)?.actionCount).toBe(1);
    expect(page.assemblies.find((assembly) => assembly.assemblyId === LADMA)?.actionCount).toBe(1);
    expect(page.summary.assembliesActedOn).toBe(2);
    expect(page.summary.actionsThisWeek).toBeGreaterThanOrEqual(2);
    expect(page.summary.pendingInvitationsOlderThan7Days).toBe(1);
  });

  it('rejects an assembly outside the live grant set', async () => {
    const deps = {
      ...createDeps(createPrisma([])),
      actorId: SUPER,
      accessibleAssemblies: accessible(),
    };
    await expect(listConcessionAudit(deps, {
      page: 1,
      pageSize: 10,
      assemblyId: OTHER,
    })).rejects.toMatchObject({ code: 'org_forbidden', statusCode: 403 });
  });

  it('applies assembly, action and date filters to the ledger', async () => {
    const base = Date.parse('2026-10-20T10:00:00.000Z');
    const rows = [
      row({ id: 'ama-bulk', action: 'staff.bulk_import.committed', actorId: SUPER, occurredAt: new Date(base), metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' } }),
      row({ id: 'ama-invite', action: 'staff.invited', actorId: SUPER, occurredAt: new Date(base + 60_000), metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' } }),
      row({ id: 'ladma-bulk', action: 'staff.bulk_import.committed', actorId: SUPER, assemblyId: LADMA, occurredAt: new Date(base + 120_000), metadata: { actorRole: 'CONCESSION_SUPER_ADMIN' } }),
    ];
    const deps = {
      ...createDeps(createPrisma(rows)),
      actorId: SUPER,
      accessibleAssemblies: accessible(),
    };
    const page = await listConcessionAudit(deps, {
      page: 1,
      pageSize: 10,
      assemblyId: AMA,
      actionPrefix: 'staff.bulk_import',
      from: new Date(base - 1000),
      to: new Date(base + 1000),
    });
    expect(page.items.map((item) => item.id)).toEqual(['ama-bulk']);
  });
});
