import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma';
import { registerConcessionOrg, type RegisterConcessionOrgInput } from './register-concession-org';

const CONCESSION = '11111111-1111-1111-1111-111111111111';
const OTHER_CONCESSION = '22222222-2222-4222-8222-222222222222';
const INFRA_ORG = '395945616116613123';
const CONCESSION_ORG = '400000000000000001';
const ASSEMBLY_ORG = '396262817453309955';

type Row = { orgId: string; concessionId: string; assemblyId: string | null; scope: string; status: string; primaryDomain?: string | null };

function matches(row: Row, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, value]) => (
    value && typeof value === 'object' && 'not' in value ? (row as any)[key] !== value.not : (row as any)[key] === value
  ));
}

function fakePrisma(rows: Row[] = [], concessions = [CONCESSION]) {
  const registry = new Map(rows.map((row) => [row.orgId, { ...row }]));
  const audits: any[] = [];
  const prisma = {
    concessionContract: {
      findUnique: async ({ where }: any) => (concessions.includes(where.id) ? { id: where.id } : null),
    },
    zitadelOrgContext: {
      findUnique: async ({ where }: any) => registry.get(where.orgId) ?? null,
      findFirst: async ({ where }: any) => [...registry.values()].find((row) => matches(row, where)) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = registry.get(where.orgId);
        if (existing) Object.assign(existing, update);
        else registry.set(where.orgId, { ...create });
      },
    },
    auditRecord: { create: async ({ data }: any) => { audits.push(data); } },
    $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(prisma),
  };
  return { prisma: prisma as unknown as PrismaClient, registry, audits };
}

function input(overrides: Partial<RegisterConcessionOrgInput> = {}): RegisterConcessionOrgInput {
  return {
    orgId: CONCESSION_ORG,
    concessionId: CONCESSION,
    infrastructureOrgId: INFRA_ORG,
    actorId: 'operator-1',
    requestId: 'request-1',
    apply: true,
    ...overrides,
  };
}

const assemblyRow: Row = { orgId: ASSEMBLY_ORG, concessionId: CONCESSION, assemblyId: 'asm-1', scope: 'ASSEMBLY', status: 'ACTIVE' };

describe('registering the concession org', () => {
  it('creates the CONCESSION row with no assembly and audits it', async () => {
    const { prisma, registry, audits } = fakePrisma([assemblyRow]);
    const result = await registerConcessionOrg(prisma, input());
    expect(result).toMatchObject({ action: 'create', applied: true });
    expect(registry.get(CONCESSION_ORG)).toMatchObject({ concessionId: CONCESSION, assemblyId: null, scope: 'CONCESSION', status: 'ACTIVE' });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'org_registry.concession_org_registered', resourceId: CONCESSION_ORG, concessionId: CONCESSION });
  });

  it('writes nothing on a dry run', async () => {
    const { prisma, registry, audits } = fakePrisma();
    expect(await registerConcessionOrg(prisma, input({ apply: false }))).toMatchObject({ action: 'create', applied: false });
    expect(registry.size).toBe(0);
    expect(audits).toHaveLength(0);
  });

  it('is a no-op when the same org is already registered', async () => {
    const row: Row = { orgId: CONCESSION_ORG, concessionId: CONCESSION, assemblyId: null, scope: 'CONCESSION', status: 'ACTIVE' };
    const { prisma, audits } = fakePrisma([row]);
    expect(await registerConcessionOrg(prisma, input())).toMatchObject({ action: 'unchanged', applied: false });
    expect(audits).toHaveLength(0);
  });

  it('reactivates a suspended concession org', async () => {
    const row: Row = { orgId: CONCESSION_ORG, concessionId: CONCESSION, assemblyId: null, scope: 'CONCESSION', status: 'SUSPENDED' };
    const { prisma, registry } = fakePrisma([row]);
    expect(await registerConcessionOrg(prisma, input())).toMatchObject({ action: 'reactivate', applied: true });
    expect(registry.get(CONCESSION_ORG)?.status).toBe('ACTIVE');
  });
});

describe('refusals write nothing', () => {
  async function refused(rows: Row[], overrides: Partial<RegisterConcessionOrgInput>, code: string, concessions?: string[]) {
    const { prisma, registry, audits } = fakePrisma(rows, concessions);
    const before = JSON.stringify([...registry.values()]);
    await expect(registerConcessionOrg(prisma, input(overrides))).rejects.toMatchObject({ code });
    expect(JSON.stringify([...registry.values()])).toBe(before);
    expect(audits).toHaveLength(0);
  }

  it('refuses ZITADEL\'s infrastructure (default) org', () => refused([], { orgId: INFRA_ORG }, 'infrastructure_org'));
  it('refuses when the infrastructure org is unknown', () => refused([], { infrastructureOrgId: '' }, 'infrastructure_org_unknown'));
  it('refuses a malformed org id', () => refused([], { orgId: 'org-1' }, 'invalid_org_id'));
  it('refuses a malformed concession id', () => refused([], { concessionId: 'conc-1' }, 'invalid_concession_id'));
  it('refuses an unknown concession', () => refused([], { concessionId: OTHER_CONCESSION }, 'concession_not_found'));

  it('refuses when the registry maps orgs to another concession', () => refused(
    [{ ...assemblyRow, concessionId: OTHER_CONCESSION }], {}, 'other_concession_registered',
  ));

  it('refuses an org already registered as an assembly org', () => refused([assemblyRow], { orgId: ASSEMBLY_ORG }, 'org_registered_as_assembly'));

  it('refuses a second concession org for the same concession', () => refused(
    [{ orgId: '400000000000000009', concessionId: CONCESSION, assemblyId: null, scope: 'CONCESSION', status: 'ACTIVE' }],
    {},
    'concession_org_exists',
  ));
});
