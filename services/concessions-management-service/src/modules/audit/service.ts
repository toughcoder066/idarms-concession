import { auditActionLabel, formatAuditDescription } from '@idarms/contracts';
import type { Prisma, PrismaClient } from '../../../generated/prisma';
import type { AccessDirectoryEntry } from '../access-directory/service';
import type { ZitadelStaffClient } from '../provisioning/zitadel-client';

export const AUDIT_DEFAULT_PAGE_SIZE = 10;
export const AUDIT_MAX_PAGE_SIZE = 100;

export interface AuditFilters {
  page: number;
  pageSize: number;
  from?: Date;
  to?: Date;
  action?: string;
  actionPrefix?: string;
  actorId?: string;
  assemblyId?: string;
}

export interface AuditActor {
  actorId: string;
  name: string | null;
  role: string | null;
  email: string | null;
}

export interface AuditEntry {
  id: string;
  occurredAt: string;
  actorId: string;
  actorName: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  action: string;
  actionLabel: string;
  resourceType: string;
  resourceId: string | null;
  assemblyId: string | null;
  assemblyName: string | null;
  assemblyCode: string | null;
  outcome: string;
  description: string;
  batchId: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AuditActorOption extends AuditActor {
  actionCount: number;
  lastActionAt: string | null;
}

export interface ConcessionAssemblyActivity {
  assemblyId: string;
  assemblyName: string | null;
  assemblyCode: string | null;
  actionCount: number;
  lastActionAt: string | null;
}

export interface ConcessionAuditSummary {
  actionsThisWeek: number;
  actionsThisMonth: number;
  assembliesActedOn: number;
  assembliesWithoutRecentActivity: number;
  pendingInvitationsOlderThan7Days: number;
}

export interface ConcessionAuditPage extends AuditPage {
  assemblies: ConcessionAssemblyActivity[];
  summary: ConcessionAuditSummary;
}

export interface AuditDeps {
  prisma: PrismaClient;
  zitadel: ZitadelStaffClient;
  /** The CONCESSION-scoped org, from the org registry; unset when none is registered. */
  concessionOrgId?: string;
  assemblyOrgId?: string;
  assemblyId?: string;
  assemblyName?: string | null;
  assemblyCode?: string | null;
}

export class AuditQueryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly auditContext?: {
      assemblyId?: string;
      concessionId?: string;
      assemblyName?: string;
    },
  ) {
    super(message);
    this.name = 'AuditQueryError';
  }
}

interface ActorCacheEntry {
  value: AuditActor;
  expiresAt: number;
}

interface TargetIdentity {
  name: string | null;
  email: string | null;
}

const actorCache = new Map<string, ActorCacheEntry>();
const ACTOR_CACHE_TTL_MS = 60_000;

export function clearAuditActorCache(): void {
  actorCache.clear();
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function metadataOf(row: { metadata: Prisma.JsonValue }): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
}

function fallbackRole(action: string): string {
  return action.startsWith('assembly.onboarding.') ? 'CONCESSION_SUPER_ADMIN' : 'UNKNOWN';
}

function buildWhere(
  scope: {
    concessionId?: string;
    assemblyId?: string;
    assemblyIds?: string[];
    actorId?: string;
  },
  filters: AuditFilters,
): Prisma.AuditRecordWhereInput {
  const where: Prisma.AuditRecordWhereInput = {};
  if (scope.concessionId) where.concessionId = scope.concessionId;
  if (scope.assemblyId) where.assemblyId = scope.assemblyId;
  else if (scope.assemblyIds) where.assemblyId = { in: scope.assemblyIds };

  const actorId = scope.actorId ?? filters.actorId;
  if (actorId) where.actorId = actorId;

  if (filters.from || filters.to) {
    where.occurredAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.action) where.action = filters.action;
  else if (filters.actionPrefix) where.action = { startsWith: filters.actionPrefix };

  return where;
}

async function getUserSafely(
  zitadel: ZitadelStaffClient,
  orgId: string | undefined,
  userId: string,
) {
  if (!orgId) return null;
  try {
    return await zitadel.getUser(orgId, userId);
  } catch {
    return null;
  }
}

async function resolveActor(
  deps: AuditDeps,
  actorId: string,
): Promise<AuditActor> {
  const cacheKey = `${deps.concessionOrgId ?? '-'}:${deps.assemblyOrgId ?? '*'}:${deps.assemblyId ?? '*'}:${actorId}`;
  const cached = actorCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const staff = await deps.prisma.staffMember.findFirst({
    where: {
      userId: actorId,
      ...(deps.assemblyId ? { assemblyId: deps.assemblyId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });

  const concessionUser = staff ? null : await getUserSafely(deps.zitadel, deps.concessionOrgId, actorId);
  const assemblyUser = staff || concessionUser
    ? null
    : await getUserSafely(deps.zitadel, deps.assemblyOrgId, actorId);
  const user = concessionUser ?? assemblyUser;
  const userName = user
    ? user.displayName
      || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
      || user.email
      || user.userName
    : null;

  const value: AuditActor = {
    actorId,
    name: staff?.name ?? userName ?? null,
    role: staff?.role ?? null,
    email: staff?.email ?? user?.email ?? null,
  };
  actorCache.set(cacheKey, { value, expiresAt: Date.now() + ACTOR_CACHE_TTL_MS });
  return value;
}

async function resolveActors(
  deps: AuditDeps,
  actorIds: readonly string[],
): Promise<Map<string, AuditActor>> {
  const unique = [...new Set(actorIds)];
  const resolved = await Promise.all(
    unique.map(async (actorId) => [actorId, await resolveActor(deps, actorId)] as const),
  );
  return new Map(resolved);
}

async function resolveTarget(
  deps: AuditDeps,
  userId: string,
): Promise<TargetIdentity> {
  const staff = await deps.prisma.staffMember.findFirst({
    where: {
      userId,
      ...(deps.assemblyId ? { assemblyId: deps.assemblyId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (staff) return { name: staff.name, email: staff.email };

  const user = await getUserSafely(deps.zitadel, deps.assemblyOrgId, userId)
    ?? await getUserSafely(deps.zitadel, deps.concessionOrgId, userId);
  if (!user) return { name: null, email: null };
  return {
    name: user.displayName
      || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
      || user.email
      || user.userName,
    email: user.email ?? null,
  };
}

async function resolveTargets(
  deps: AuditDeps,
  rows: ReadonlyArray<{ resourceType: string; resourceId: string | null }>,
): Promise<Map<string, TargetIdentity>> {
  const userIds = [...new Set(rows
    .filter((row) => row.resourceType === 'User' && row.resourceId)
    .map((row) => row.resourceId as string))];
  const resolved = await Promise.all(
    userIds.map(async (userId) => [userId, await resolveTarget(deps, userId)] as const),
  );
  return new Map(resolved);
}

function toAuditEntry(
  row: {
    id: string;
    occurredAt: Date;
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    assemblyId: string | null;
    outcome: string;
    metadata: Prisma.JsonValue;
  },
  actors: Map<string, AuditActor>,
  targets: Map<string, TargetIdentity>,
  assembly: { name: string | null; code: string | null },
  roleFallback: string,
): AuditEntry {
  const metadata = metadataOf(row);
  const actor = actors.get(row.actorId);
  const actorRole = stringValue(metadata.actorRole) ?? actor?.role ?? roleFallback;
  const target = row.resourceType === 'User' && row.resourceId
    ? targets.get(row.resourceId)
    : undefined;
  const formattingMetadata = {
    ...metadata,
    ...(target?.email && !stringValue(metadata.email) ? { email: target.email } : {}),
    ...(target?.name && !stringValue(metadata.name) ? { name: target.name } : {}),
  };
  const description = formatAuditDescription({
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    assemblyName: assembly.name,
    metadata: { ...formattingMetadata, actorRole },
  });
  const batchId = stringValue(metadata.batchId)
    ?? (row.resourceType === 'StaffImportBatch' ? row.resourceId : null);

  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorId: row.actorId,
    actorName: stringValue(metadata.actorName) ?? actor?.name ?? null,
    actorRole,
    actorEmail: stringValue(metadata.actorEmail) ?? actor?.email ?? null,
    action: row.action,
    actionLabel: auditActionLabel(row.action),
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    assemblyId: row.assemblyId,
    assemblyName: assembly.name,
    assemblyCode: assembly.code,
    outcome: row.outcome,
    description,
    batchId,
    metadata: formattingMetadata,
  };
}

async function queryPage(
  deps: AuditDeps,
  where: Prisma.AuditRecordWhereInput,
  filters: AuditFilters,
  assemblyById: Map<string, { name: string | null; code: string | null }>,
  defaultAssembly: { name: string | null; code: string | null },
  roleFallback: (action: string) => string,
): Promise<AuditPage> {
  const [rows, total] = await deps.prisma.$transaction([
    deps.prisma.auditRecord.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    deps.prisma.auditRecord.count({ where }),
  ]);
  const actors = await resolveActors(deps, rows.map((row) => row.actorId));
  const targets = await resolveTargets(deps, rows);
  const items = rows.map((row) => toAuditEntry(
    row,
    actors,
    targets,
    row.assemblyId ? assemblyById.get(row.assemblyId) ?? defaultAssembly : defaultAssembly,
    roleFallback(row.action),
  ));
  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    hasMore: filters.page * filters.pageSize < total,
  };
}

export async function listAssemblyAudit(
  deps: AuditDeps & { assemblyId: string; assemblyOrgId: string },
  filters: AuditFilters,
): Promise<AuditPage> {
  const where = buildWhere({ assemblyId: deps.assemblyId }, filters);
  const assembly = { name: deps.assemblyName ?? null, code: deps.assemblyCode ?? null };
  return queryPage(
    deps,
    where,
    filters,
    new Map([[deps.assemblyId, assembly]]),
    assembly,
    fallbackRole,
  );
}

export async function listAssemblyAuditActors(
  deps: AuditDeps & { assemblyId: string; assemblyOrgId: string },
  filters: AuditFilters,
): Promise<AuditActorOption[]> {
  const where = buildWhere({ assemblyId: deps.assemblyId }, { ...filters, actorId: undefined });
  const groups = await deps.prisma.auditRecord.groupBy({
    by: ['actorId'],
    where,
    _count: { _all: true },
    _max: { occurredAt: true },
  });
  const actors = await resolveActors(deps, groups.map((group) => group.actorId));
  const samples = await Promise.all(groups.map((group) => deps.prisma.auditRecord.findFirst({
    where: { ...where, actorId: group.actorId },
    orderBy: { occurredAt: 'desc' },
    select: { action: true, metadata: true },
  })));
  return groups
    .map((group, index) => {
      const actor = actors.get(group.actorId);
      const sample = samples[index];
      const sampleMetadata = sample ? metadataOf(sample) : {};
      return {
        actorId: group.actorId,
        name: actor?.name ?? null,
        role: stringValue(sampleMetadata.actorRole)
          ?? actor?.role
          ?? fallbackRole(sample?.action ?? ''),
        email: actor?.email ?? null,
        actionCount: group._count._all,
        lastActionAt: group._max.occurredAt?.toISOString() ?? null,
      };
    })
    .sort((left, right) => (right.lastActionAt ?? '').localeCompare(left.lastActionAt ?? ''));
}

function startOfWeek(now: Date): Date {
  const date = new Date(now);
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - offset);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(now: Date): Date {
  const date = new Date(now);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function listConcessionAudit(
  deps: AuditDeps & {
    actorId: string;
    accessibleAssemblies: readonly AccessDirectoryEntry[];
  },
  filters: AuditFilters,
): Promise<ConcessionAuditPage> {
  const accessible = deps.accessibleAssemblies;
  const accessibleIds = accessible.map((entry) => entry.assemblyId);
  if (filters.assemblyId && !accessibleIds.includes(filters.assemblyId)) {
    throw new AuditQueryError(
      'That assembly is outside your live Super Admin grant set.',
      'org_forbidden',
      403,
      { assemblyId: filters.assemblyId },
    );
  }
  if (accessibleIds.length === 0) {
    return {
      items: [],
      total: 0,
      page: filters.page,
      pageSize: filters.pageSize,
      hasMore: false,
      assemblies: [],
      summary: {
        actionsThisWeek: 0,
        actionsThisMonth: 0,
        assembliesActedOn: 0,
        assembliesWithoutRecentActivity: 0,
        pendingInvitationsOlderThan7Days: 0,
      },
    };
  }

  const where = buildWhere({
    assemblyIds: filters.assemblyId ? undefined : accessibleIds,
    assemblyId: filters.assemblyId,
    actorId: deps.actorId,
  }, filters);
  const assemblyById = new Map(accessible.map((entry) => [
    entry.assemblyId,
    { name: entry.assemblyName, code: entry.assemblyCode },
  ]));
  const page = await queryPage(
    deps,
    where,
    filters,
    assemblyById,
    { name: null, code: null },
    () => 'CONCESSION_SUPER_ADMIN',
  );

  const baseWhere: Prisma.AuditRecordWhereInput = {
    assemblyId: { in: accessibleIds },
    actorId: deps.actorId,
  };
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const recentThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const pendingThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [actionsThisWeek, actionsThisMonth, groups, pendingInvitationsOlderThan7Days] = await Promise.all([
    deps.prisma.auditRecord.count({ where: { ...baseWhere, occurredAt: { gte: weekStart } } }),
    deps.prisma.auditRecord.count({ where: { ...baseWhere, occurredAt: { gte: monthStart } } }),
    deps.prisma.auditRecord.groupBy({
      by: ['assemblyId'],
      where: baseWhere,
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    deps.prisma.staffMember.count({
      where: {
        assemblyId: { in: accessibleIds },
        lastKnownStatus: 'INVITED',
        invitedAt: { lt: pendingThreshold },
      },
    }),
  ]);

  const groupByAssembly = new Map(groups.map((group) => [group.assemblyId, group]));
  const assemblies: ConcessionAssemblyActivity[] = accessible.map((entry) => {
    const group = groupByAssembly.get(entry.assemblyId);
    return {
      assemblyId: entry.assemblyId,
      assemblyName: entry.assemblyName,
      assemblyCode: entry.assemblyCode,
      actionCount: group?._count._all ?? 0,
      lastActionAt: group?._max.occurredAt?.toISOString() ?? null,
    };
  }).sort((left, right) => (right.lastActionAt ?? '').localeCompare(left.lastActionAt ?? ''));

  return {
    ...page,
    assemblies,
    summary: {
      actionsThisWeek,
      actionsThisMonth,
      assembliesActedOn: groups.length,
      assembliesWithoutRecentActivity: accessibleIds.filter((assemblyId) => {
        const group = groupByAssembly.get(assemblyId);
        return !group?._max.occurredAt || group._max.occurredAt < recentThreshold;
      }).length,
      pendingInvitationsOlderThan7Days,
    },
  };
}
