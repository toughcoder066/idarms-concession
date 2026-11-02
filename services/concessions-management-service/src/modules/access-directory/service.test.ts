import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma';
import {
  clearAccessDirectoryCache,
  getAccessibleAssemblies,
  invalidateAccessDirectory,
} from './service';
import type { ZitadelProvisioningClient, ZitadelUserGrant } from '../provisioning/zitadel-client';

const projectId = 'project-1';
const userId = 'super-1';

function registryRows() {
  return [
    {
      orgId: 'org-a',
      concessionId: 'concession-1',
      assemblyId: 'assembly-a',
      scope: 'ASSEMBLY',
      primaryDomain: 'a.localhost',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
    {
      orgId: 'org-b',
      concessionId: 'concession-1',
      assemblyId: 'assembly-b',
      scope: 'ASSEMBLY',
      primaryDomain: 'b.localhost',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
    },
  ];
}

function createPrisma(rows: any[]): PrismaClient {
  return {
    zitadelOrgContext: {
      findMany: async ({ where }: any) => rows.filter((row) =>
        (!where?.scope || row.scope === where.scope)
        && (!where?.status || row.status === where.status)
        && (!where?.concessionId || row.concessionId === where.concessionId)
        && (!where?.assemblyId?.not || row.assemblyId !== null)),
    },
    assembly: {
      findMany: async ({ where }: any) => rows
        .filter((row) => where.id.in.includes(row.assemblyId))
        .map((row) => ({
          id: row.assemblyId,
          assemblyName: `Assembly ${row.assemblyId}`,
          assemblyCode: row.assemblyId.toUpperCase(),
        })),
    },
  } as unknown as PrismaClient;
}

function createZitadel(grantedOrgIds: Set<string>) {
  const listUserGrants = vi.fn(async ({ orgId }: { orgId: string; userId: string; projectId: string }) =>
    (grantedOrgIds.has(orgId)
      ? [{
        id: `grant-${orgId}`,
        userId,
        roleKeys: ['CONCESSION_SUPER_ADMIN'],
        orgId,
        projectId,
      } satisfies ZitadelUserGrant]
      : []));

  const client = { listUserGrants } as unknown as ZitadelProvisioningClient;
  return { client, listUserGrants };
}

describe('Access Directory', () => {
  beforeEach(() => {
    clearAccessDirectoryCache();
  });

  it('queries live grants, caches for the TTL, and shows a new assembly immediately after invalidation', async () => {
    const rows = registryRows();
    const granted = new Set(['org-a']);
    const prisma = createPrisma(rows);
    const { client, listUserGrants } = createZitadel(granted);
    let now = 1_000;

    const first = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      ttlMs: 15_000,
      now: () => now,
    });
    expect(first.map((entry) => entry.orgId)).toEqual(['org-a']);
    expect(listUserGrants).toHaveBeenCalledTimes(2);

    const cached = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      ttlMs: 15_000,
      now: () => now,
    });
    expect(cached.map((entry) => entry.orgId)).toEqual(['org-a']);
    expect(listUserGrants).toHaveBeenCalledTimes(2);

    // A new assembly is provisioned and the Super Admin receives a grant.
    granted.add('org-b');
    const stillCached = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      ttlMs: 15_000,
      now: () => now,
    });
    expect(stillCached.map((entry) => entry.orgId)).toEqual(['org-a']);

    invalidateAccessDirectory([userId]);
    const afterInvalidation = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      ttlMs: 15_000,
      now: () => now,
    });
    expect(afterInvalidation.map((entry) => entry.orgId)).toEqual(['org-a', 'org-b']);
    expect(afterInvalidation[1]).toMatchObject({
      assemblyId: 'assembly-b',
      assemblyName: 'Assembly assembly-b',
      assemblyCode: 'ASSEMBLY-B',
      primaryDomain: 'b.localhost',
    });
    expect(listUserGrants).toHaveBeenCalledTimes(4);
  });

  it('refreshes after the 15 second staleness window even without invalidation', async () => {
    const rows = registryRows();
    const granted = new Set(['org-a']);
    const prisma = createPrisma(rows);
    const { client, listUserGrants } = createZitadel(granted);
    let now = 1_000;

    await getAccessibleAssemblies(prisma, client, { userId, projectId, ttlMs: 15_000, now: () => now });
    granted.add('org-b');
    now += 15_001;

    const refreshed = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      ttlMs: 15_000,
      now: () => now,
    });
    expect(refreshed.map((entry) => entry.orgId)).toEqual(['org-a', 'org-b']);
    expect(listUserGrants).toHaveBeenCalledTimes(4);
  });

  it('does not include an assembly where the user holds no live grant', async () => {
    const rows = registryRows();
    const granted = new Set(['org-a']);
    const prisma = createPrisma(rows);
    const { client } = createZitadel(granted);

    const entries = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      ttlMs: 15_000,
      now: () => 1_000,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ orgId: 'org-a', role: 'CONCESSION_SUPER_ADMIN' });
  });

  it('filters to the caller concession when one is supplied', async () => {
    const rows = registryRows();
    rows[1].concessionId = 'concession-2';
    const granted = new Set(['org-a', 'org-b']);
    const prisma = createPrisma(rows);
    const { client } = createZitadel(granted);

    const scoped = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      concessionId: 'concession-1',
      ttlMs: 15_000,
      now: () => 1_000,
    });
    expect(scoped.map((entry) => entry.orgId)).toEqual(['org-a']);

    const unscoped = await getAccessibleAssemblies(prisma, client, {
      userId,
      projectId,
      ttlMs: 15_000,
      now: () => 1_000,
    });
    expect(unscoped.map((entry) => entry.orgId)).toEqual(['org-a', 'org-b']);
  });
});
