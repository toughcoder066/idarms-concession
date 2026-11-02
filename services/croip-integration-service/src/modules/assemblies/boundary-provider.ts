import type { PrismaClient } from '../../../generated/prisma';

export interface AssignedAssemblyView {
  assemblyId: string;
  concessionId: string;
  regionId: string | null;
  code: string;
  name: string;
  category: string | null;
  contractStart: Date | null;
  contractEnd: Date;
  status: string;
  /** True when ACTIVE and today falls inside the contract dates. */
  assignedNow: boolean;
  source: string;
  importVersion: number;
  importedAt: Date;
}

/**
 * The one answer to "which assemblies are ours right now?". Sync scoping, registration
 * pre-checks and the super admin view all ask this. Implementations: the manual import
 * table now; a CROIP-backed provider once CROIP exposes assignments to a concession (G1).
 */
export interface BoundaryProvider {
  listAssigned(options?: { includeRemoved?: boolean; at?: Date }): Promise<AssignedAssemblyView[]>;
  isAssigned(assemblyId: string, at?: Date): Promise<boolean>;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * CROIP keeps an assignment ACTIVE after its contract end date (it never checks it),
 * so the end date is enforced here: an expired contract is not ours, even before the
 * next import marks it REMOVED.
 */
export function isAssignedOn(
  row: { status: string; contractStart: Date | null; contractEnd: Date },
  at: Date,
): boolean {
  const day = startOfUtcDay(at).getTime();
  return row.status === 'ACTIVE'
    && (!row.contractStart || row.contractStart.getTime() <= day)
    && row.contractEnd.getTime() >= day;
}

const viewSelect = {
  assemblyId: true,
  concessionId: true,
  regionId: true,
  code: true,
  name: true,
  category: true,
  contractStart: true,
  contractEnd: true,
  status: true,
  source: true,
  importVersion: true,
  importedAt: true,
} as const;

export class ManualImportBoundaryProvider implements BoundaryProvider {
  constructor(private readonly prisma: PrismaClient, private readonly concessionId: string) {}

  async listAssigned(options: { includeRemoved?: boolean; at?: Date } = {}): Promise<AssignedAssemblyView[]> {
    const at = options.at ?? new Date();
    const rows = await this.prisma.assignedAssembly.findMany({
      where: {
        concessionId: this.concessionId,
        ...(options.includeRemoved ? {} : { status: 'ACTIVE' }),
      },
      select: viewSelect,
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({ ...row, assignedNow: isAssignedOn(row, at) }));
  }

  async isAssigned(assemblyId: string, at: Date = new Date()): Promise<boolean> {
    const row = await this.prisma.assignedAssembly.findFirst({
      where: { assemblyId, concessionId: this.concessionId },
      select: { status: true, contractStart: true, contractEnd: true },
    });
    return row ? isAssignedOn(row, at) : false;
  }
}
