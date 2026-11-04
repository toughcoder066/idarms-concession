import { describe, expect, it } from 'vitest';
import { concessionOrgId, resolveOrgContext } from './context';
import type { PrismaClient } from '../../../generated/prisma';

function prismaWith(registry: Record<string, unknown> | null, others: { assembly?: unknown; contract?: unknown } = {}): PrismaClient {
  return {
    zitadelOrgContext: {
      findUnique: async () => registry,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => (
        registry && Object.entries(where).every(([key, value]) => registry[key] === value) ? registry : null
      ),
    },
    assembly: { findUnique: async () => others.assembly ?? null },
    concessionContract: { findUnique: async () => others.contract ?? null },
  } as unknown as PrismaClient;
}

const assemblyRow = { orgId: 'org-assembly', concessionId: 'concession-1', assemblyId: 'assembly-1', scope: 'ASSEMBLY', status: 'ACTIVE' };
const concessionRow = { orgId: 'org-concession', concessionId: 'concession-1', assemblyId: null, scope: 'CONCESSION', status: 'ACTIVE' };

describe('resolveOrgContext reads the org registry only', () => {
  it('resolves an assembly org to its concession and assembly', async () => {
    expect(await resolveOrgContext(prismaWith(assemblyRow), 'org-assembly')).toEqual({
      orgId: 'org-assembly', concessionId: 'concession-1', assemblyId: 'assembly-1', scope: 'ASSEMBLY',
    });
  });

  it('resolves the concession org to concession-wide context', async () => {
    expect(await resolveOrgContext(prismaWith(concessionRow), 'org-concession')).toEqual({
      orgId: 'org-concession', concessionId: 'concession-1', assemblyId: null, scope: 'CONCESSION',
    });
  });

  it('does not guess from the assembly or contract tables', async () => {
    const prisma = prismaWith(null, {
      assembly: { id: 'assembly-1', concessions: [{ concessionId: 'concession-1' }] },
      contract: { id: 'concession-1' },
    });
    expect(await resolveOrgContext(prisma, 'org-unregistered')).toBeNull();
  });

  it('ignores a row that is not active', async () => {
    expect(await resolveOrgContext(prismaWith({ ...assemblyRow, status: 'SUSPENDED' }), 'org-assembly')).toBeNull();
  });

  it('refuses inconsistent rows and unknown scopes', async () => {
    expect(await resolveOrgContext(prismaWith({ ...concessionRow, assemblyId: 'assembly-1' }), 'org-concession')).toBeNull();
    expect(await resolveOrgContext(prismaWith({ ...assemblyRow, assemblyId: null }), 'org-assembly')).toBeNull();
    // The retired scope name is not accepted.
    expect(await resolveOrgContext(prismaWith({ ...concessionRow, scope: 'PORTFOLIO' }), 'org-concession')).toBeNull();
  });

  it('returns null for an unmapped org', async () => {
    expect(await resolveOrgContext(prismaWith(null), 'org-unknown')).toBeNull();
  });
});

describe('concessionOrgId', () => {
  it('finds the active concession org of a concession', async () => {
    expect(await concessionOrgId(prismaWith(concessionRow), 'concession-1')).toBe('org-concession');
  });

  it('is null when no concession org is registered', async () => {
    expect(await concessionOrgId(prismaWith(assemblyRow), 'concession-1')).toBeNull();
  });
});
