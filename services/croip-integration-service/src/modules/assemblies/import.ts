import { Prisma, type PrismaClient } from '../../../generated/prisma';
import { assignedAssemblyFileSchema, type AssignedAssemblyEntry } from './schemas';

/** The fields of a stored row the import compares and writes. */
export interface StoredAssembly {
  assemblyId: string;
  concessionId: string;
  regionId: string | null;
  code: string;
  name: string;
  category: string | null;
  contractStart: Date | null;
  contractEnd: Date;
  status: string;
  polygonGeoJson: unknown;
}

export interface ImportPlan {
  create: AssignedAssemblyEntry[];
  update: AssignedAssemblyEntry[];
  remove: string[];
  unchanged: string[];
}

export class AssemblyImportError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
  }
}

function toDate(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

function sameDate(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

function differs(row: StoredAssembly, entry: AssignedAssemblyEntry): boolean {
  return row.status !== 'ACTIVE'
    || row.code !== entry.code
    || row.name !== entry.name
    || row.category !== (entry.category ?? null)
    || row.regionId !== (entry.regionId ?? null)
    || !sameDate(row.contractStart, toDate(entry.contractStart))
    || !sameDate(row.contractEnd, toDate(entry.contractEnd)!)
    || JSON.stringify(row.polygonGeoJson ?? null) !== JSON.stringify(entry.polygonGeoJson ?? null);
}

/**
 * Validate an import file and work out what changes. Pure, so every rule is testable
 * without a database. The file is the full current list: a stored assembly that is
 * missing from it is removed (marked, never deleted).
 */
export function planAssemblyImport(raw: unknown, expectedConcessionId: string, stored: StoredAssembly[]): ImportPlan {
  const parsed = assignedAssemblyFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AssemblyImportError(
      'Assembly file is invalid; nothing was imported',
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(file)'}: ${issue.message}`),
    );
  }
  const file = parsed.data;
  if (file.concessionId !== expectedConcessionId) {
    throw new AssemblyImportError(
      `Assembly file is for concession ${file.concessionId}, but this installation serves ${expectedConcessionId}; nothing was imported`,
    );
  }
  const foreign = stored.filter((row) => row.concessionId !== expectedConcessionId);
  if (foreign.length > 0) {
    throw new AssemblyImportError(
      'Stored assemblies belong to another concession; refusing to import',
      foreign.map((row) => row.assemblyId),
    );
  }

  const byId = new Map(stored.map((row) => [row.assemblyId, row]));
  const listed = new Set(file.assemblies.map((entry) => entry.assemblyId));
  const plan: ImportPlan = { create: [], update: [], remove: [], unchanged: [] };

  for (const entry of file.assemblies) {
    const row = byId.get(entry.assemblyId);
    if (!row) plan.create.push(entry);
    else if (differs(row, entry)) plan.update.push(entry);
    else plan.unchanged.push(entry.assemblyId);
  }
  for (const row of stored) {
    if (!listed.has(row.assemblyId) && row.status === 'ACTIVE') plan.remove.push(row.assemblyId);
  }
  return plan;
}

export interface ImportResult extends ImportPlan {
  importVersion: number | null;
}

function rowData(entry: AssignedAssemblyEntry) {
  return {
    regionId: entry.regionId ?? null,
    code: entry.code,
    name: entry.name,
    category: entry.category ?? null,
    contractStart: toDate(entry.contractStart),
    contractEnd: toDate(entry.contractEnd)!,
    status: 'ACTIVE',
    polygonGeoJson: (entry.polygonGeoJson ?? undefined) as Prisma.InputJsonValue | undefined,
    removedAt: null,
  };
}

/**
 * Apply an assembly file in one transaction, with an audit record. Running the same
 * file again changes nothing and does not bump the import version.
 */
export async function importAssignedAssemblies(
  prisma: PrismaClient,
  raw: unknown,
  context: { concessionId: string; actorId: string; requestId: string; now?: Date },
): Promise<ImportResult> {
  const now = context.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const stored = await tx.assignedAssembly.findMany();
    const plan = planAssemblyImport(raw, context.concessionId, stored);
    const changed = plan.create.length + plan.update.length + plan.remove.length > 0;

    let importVersion: number | null = null;
    if (changed) {
      const latest = await tx.assignedAssembly.aggregate({ _max: { importVersion: true } });
      importVersion = (latest._max.importVersion ?? 0) + 1;
      const stamp = { source: 'MANUAL_IMPORT', importVersion, importedAt: now };

      for (const entry of plan.create) {
        await tx.assignedAssembly.create({
          data: { assemblyId: entry.assemblyId, concessionId: context.concessionId, ...rowData(entry), ...stamp },
        });
      }
      for (const entry of plan.update) {
        await tx.assignedAssembly.update({
          where: { assemblyId: entry.assemblyId },
          data: {
            ...rowData(entry),
            polygonGeoJson: entry.polygonGeoJson ? (entry.polygonGeoJson as Prisma.InputJsonValue) : Prisma.DbNull,
            ...stamp,
          },
        });
      }
      if (plan.remove.length > 0) {
        await tx.assignedAssembly.updateMany({
          where: { assemblyId: { in: plan.remove } },
          data: { status: 'REMOVED', removedAt: now, ...stamp },
        });
      }
    }

    await tx.auditRecord.create({
      data: {
        actorId: context.actorId,
        actorType: 'operator',
        concessionId: context.concessionId,
        action: changed ? 'assigned_assemblies.imported' : 'assigned_assemblies.import_unchanged',
        resourceType: 'AssignedAssembly',
        requestId: context.requestId,
        outcome: 'SUCCESS',
        metadata: {
          importVersion,
          created: plan.create.map((entry) => entry.assemblyId),
          updated: plan.update.map((entry) => entry.assemblyId),
          removed: plan.remove,
          unchanged: plan.unchanged.length,
        },
      },
    });

    return { ...plan, importVersion };
  });
}
