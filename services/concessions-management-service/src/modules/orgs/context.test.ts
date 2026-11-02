import { describe, expect, it } from 'vitest';
import { resolveOrgContext } from './context';
import type { PrismaClient } from '../../../generated/prisma';

function prismaWith(overrides: {
  registry?: unknown;
  assembly?: unknown;
  contract?: unknown;
}): PrismaClient {
  return {
    zitadelOrgContext: { findUnique: async () => overrides.registry ?? null },
    assembly: { findUnique: async () => overrides.assembly ?? null },
    concessionContract: { findUnique: async () => overrides.contract ?? null },
  } as unknown as PrismaClient;
}

describe('resolveOrgContext', () => {
  it('uses the explicit org registry first', async () => {
    const result = await resolveOrgContext(
      prismaWith({
        registry: {
          orgId: 'org-assembly',
          concessionId: 'concession-1',
          assemblyId: 'assembly-1',
          scope: 'ASSEMBLY',
        },
      }),
      'org-assembly',
    );
    expect(result).toEqual({
      orgId: 'org-assembly',
      concessionId: 'concession-1',
      assemblyId: 'assembly-1',
      scope: 'ASSEMBLY',
    });
  });

  it('resolves an assembly org to its concession and assembly', async () => {
    const result = await resolveOrgContext(
      prismaWith({ assembly: { id: 'assembly-1', concessions: [{ concessionId: 'concession-1' }] } }),
      'org-assembly',
    );
    expect(result).toEqual({
      orgId: 'org-assembly',
      concessionId: 'concession-1',
      assemblyId: 'assembly-1',
      scope: 'ASSEMBLY',
    });
  });

  it('resolves a portfolio org to its concession', async () => {
    const result = await resolveOrgContext(
      prismaWith({ contract: { id: 'concession-1' } }),
      'org-portfolio',
    );
    expect(result).toEqual({
      orgId: 'org-portfolio',
      concessionId: 'concession-1',
      assemblyId: null,
      scope: 'PORTFOLIO',
    });
  });

  it('returns null for an unmapped org', async () => {
    expect(await resolveOrgContext(prismaWith({}), 'org-unknown')).toBeNull();
  });
});
