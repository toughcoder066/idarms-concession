import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from './audit';
import type { RatesSaveInput } from './schemas';

function number(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

async function loadAssembly(prisma: PrismaClient, id: string, concessionId: string, assemblyId?: string) {
  if (assemblyId && assemblyId !== id) return null;
  return prisma.assembly.findFirst({
    where: { id, concessions: { some: { concessionId } } },
    include: {
      concessions: { where: { concessionId }, include: { contract: true } },
    },
  });
}

export async function getRateMatrix(
  prisma: PrismaClient,
  assemblyId: string,
  scope: { concessionId: string; assemblyId?: string },
  fiscalYear: number,
) {
  const assembly = await loadAssembly(prisma, assemblyId, scope.concessionId, scope.assemblyId);
  if (!assembly) return null;

  const [types, current, previous] = await Promise.all([
    prisma.propertyTypeLookup.findMany({
      where: { isActive: true },
      include: { usages: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.feeFixingBylaw.findMany({ where: { assemblyId, fiscalYear } }),
    prisma.feeFixingBylaw.findMany({ where: { assemblyId, fiscalYear: fiscalYear - 1 } }),
  ]);

  const currentByKey = new Map(current.map((row) => [`${row.propertyTypeId}:${row.propertyUsageId}`, row]));
  const previousByKey = new Map(previous.map((row) => [`${row.propertyTypeId}:${row.propertyUsageId}`, row]));

  const rows = types.flatMap((type) => type.usages.map((usage) => {
    const key = `${type.id}:${usage.id}`;
    const now = currentByKey.get(key);
    const before = previousByKey.get(key);
    const baseRate = now ? number(now.baseRate) : null;
    const previousBaseRate = before ? number(before.baseRate) : null;
    return {
      propertyTypeId: type.id,
      propertyTypeCode: type.code,
      propertyTypeName: type.name,
      propertyUsageId: usage.id,
      propertyUsageCode: usage.code,
      propertyUsageName: usage.name,
      baseRate,
      rateImpost: now ? number(now.rateImpost) : null,
      minimumLevy: now ? number(now.minimumLevy) : null,
      currency: now?.currency ?? 'GHS',
      status: now?.status ?? 'NOT_CONFIGURED',
      version: now?.version ?? 0,
      publishedAt: now?.publishedAt ?? null,
      previousBaseRate,
      previousRateImpost: before ? number(before.rateImpost) : null,
      changePct: percentChange(baseRate, previousBaseRate),
    };
  }));

  const configured = rows.filter((row) => row.baseRate !== null);
  const pending = rows.filter((row) => row.status === 'PENDING_APPROVAL');
  const published = rows.filter((row) => row.status === 'PUBLISHED');
  const status = pending.length > 0
    ? 'PENDING_APPROVAL'
    : published.length > 0 && published.length === configured.length
      ? 'PUBLISHED'
      : configured.length > 0
        ? 'DRAFT'
        : 'NOT_CONFIGURED';

  const movers = configured
    .filter((row) => row.changePct !== null)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
  const changes = configured
    .map((row) => row.changePct)
    .filter((value): value is number => value !== null);

  return {
    assembly: {
      id: assembly.id,
      assemblyCode: assembly.assemblyCode,
      assemblyName: assembly.assemblyName,
      region: assembly.region,
      contract: assembly.concessions[0]?.contract ?? null,
    },
    fiscalYear,
    previousFiscalYear: fiscalYear - 1,
    rows,
    summary: {
      configured: configured.length,
      total: rows.length,
      pending: pending.length,
      published: published.length,
      completionPct: rows.length ? Math.round((configured.length / rows.length) * 100) : 0,
      status,
      canEdit: status !== 'PENDING_APPROVAL' && status !== 'PUBLISHED',
      averageChangePct: changes.length ? changes.reduce((total, value) => total + value, 0) / changes.length : null,
      minimumLevyCount: configured.filter((row) => (row.minimumLevy ?? 0) > 0).length,
      movers: movers.slice(0, 5).map((row) => ({
        label: `${row.propertyTypeCode} · ${row.propertyUsageCode}`,
        changePct: row.changePct,
        baseRate: row.baseRate,
        previousBaseRate: row.previousBaseRate,
      })),
    },
  };
}

export async function saveRates(
  prisma: PrismaClient,
  assemblyId: string,
  scope: { concessionId: string; assemblyId?: string },
  input: RatesSaveInput,
  context: { actorId: string; requestId: string },
) {
  const assembly = await loadAssembly(prisma, assemblyId, scope.concessionId, scope.assemblyId);
  if (!assembly) return { error: 'not_found' as const };

  const existing = await prisma.feeFixingBylaw.findMany({
    where: { assemblyId, fiscalYear: input.fiscalYear },
  });
  if (existing.some((row) => row.status === 'PENDING_APPROVAL' || row.status === 'PUBLISHED')) {
    return { error: 'rates_locked' as const };
  }

  const usages = await prisma.propertyUsageLookup.findMany({
    where: { id: { in: input.rows.map((row) => row.propertyUsageId) } },
  });
  const usagesById = new Map(usages.map((usage) => [usage.id, usage]));
  if (input.rows.some((row) => usagesById.get(row.propertyUsageId)?.propertyTypeId !== row.propertyTypeId)) {
    return { error: 'invalid_lookup' as const };
  }

  await prisma.$transaction(async (tx) => {
    for (const row of input.rows) {
      await tx.feeFixingBylaw.upsert({
        where: {
          assemblyId_fiscalYear_propertyTypeId_propertyUsageId: {
            assemblyId,
            fiscalYear: input.fiscalYear,
            propertyTypeId: row.propertyTypeId,
            propertyUsageId: row.propertyUsageId,
          },
        },
        create: {
          assemblyId,
          fiscalYear: input.fiscalYear,
          propertyTypeId: row.propertyTypeId,
          propertyUsageId: row.propertyUsageId,
          baseRate: row.baseRate,
          rateImpost: row.rateImpost,
          minimumLevy: row.minimumLevy ?? 0,
          status: 'DRAFT',
        },
        update: {
          baseRate: row.baseRate,
          rateImpost: row.rateImpost,
          minimumLevy: row.minimumLevy ?? 0,
          status: 'DRAFT',
          publishedAt: null,
          publishedBy: null,
          isActive: true,
        },
      });
    }
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: scope.concessionId,
      assemblyId,
      action: 'fee_fixing.draft_saved',
      resourceType: 'FeeFixingBylaw',
      resourceId: assemblyId,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Saved FY${input.fiscalYear} fee-fixing draft for ${assembly.assemblyName} (${input.rows.length} rate rows).`,
      metadata: { fiscalYear: input.fiscalYear, rows: input.rows.length },
    });
  });

  return { saved: input.rows.length };
}

export async function submitRates(
  prisma: PrismaClient,
  assemblyId: string,
  scope: { concessionId: string; assemblyId?: string },
  input: { fiscalYear: number; note?: string },
  context: { actorId: string; roles: string[]; requestId: string },
) {
  const assembly = await loadAssembly(prisma, assemblyId, scope.concessionId, scope.assemblyId);
  if (!assembly) return { error: 'not_found' as const };

  const rows = await prisma.feeFixingBylaw.findMany({ where: { assemblyId, fiscalYear: input.fiscalYear } });
  if (rows.length === 0) return { error: 'no_rates' as const };
  if (rows.some((row) => row.status === 'PUBLISHED')) return { error: 'already_published' as const };

  const pending = await prisma.approvalRequest.findFirst({
    where: { assemblyId, requestType: 'RATE_MATRIX', status: 'PENDING' },
  });
  if (pending) return { error: 'approval_exists' as const, approvalId: pending.id };

  const requestedAsSupport = context.roles.includes('CONCESSION_SUPER_ADMIN');
  const summary = requestedAsSupport
    ? `Draft prepared by Concession Support for FY${input.fiscalYear} rate matrix.`
    : `FY${input.fiscalYear} rate matrix submitted for Assembly approval.`;

  const approval = await prisma.$transaction(async (tx) => {
    await tx.feeFixingBylaw.updateMany({
      where: { assemblyId, fiscalYear: input.fiscalYear },
      data: { status: 'PENDING_APPROVAL' },
    });
    const created = await tx.approvalRequest.create({
      data: {
        assemblyId,
        requestType: 'RATE_MATRIX',
        status: 'PENDING',
        requestedBy: context.actorId,
        requestedByName: context.roles.length ? context.roles.join(', ') : null,
        requiredRole: 'ASSEMBLY_ADMIN',
        summary,
        payload: {
          fiscalYear: input.fiscalYear,
          rowCount: rows.length,
          note: input.note ?? null,
          requestedAs: requestedAsSupport ? 'SUPPORT_FOR_MMDA' : 'MMDA',
        },
        slaDueAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: scope.concessionId,
      assemblyId,
      action: 'fee_fixing.submitted',
      resourceType: 'ApprovalRequest',
      resourceId: created.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `${summary} ${rows.length} rate rows are awaiting approval.`,
      metadata: { fiscalYear: input.fiscalYear, rowCount: rows.length },
    });
    return created;
  });

  return { approval: { ...approval, amount: approval.amount === null ? null : Number(approval.amount) } };
}
