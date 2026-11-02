import type { PrismaClient } from '../../../generated/prisma';
import type { ZitadelProvisioningClient } from '../provisioning/zitadel-client';

export const ACCESS_DIRECTORY_DEFAULT_TTL_MS = 15_000;

export interface AccessDirectoryEntry {
  orgId: string;
  assemblyId: string;
  assemblyName: string | null;
  assemblyCode: string | null;
  concessionId: string;
  primaryDomain: string | null;
  role: 'CONCESSION_SUPER_ADMIN';
}

interface CacheEntry {
  value: AccessDirectoryEntry[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
// Process-local cache. A multi-replica deployment would need a shared cache plus
// an invalidation bus; the local single-process service invalidates synchronously.

function cacheKey(userId: string, projectId: string, concessionId?: string): string {
  return `${userId}:${projectId}:${concessionId ?? '*'}`;
}

/**
 * Synchronous invalidation is called by the provisioning saga so a newly
 * created assembly appears in the Access Directory without a re-login.
 */
export function invalidateAccessDirectory(userIds: readonly string[]): void {
  for (const userId of userIds) {
    for (const key of cache.keys()) {
      if (key === userId || key.startsWith(`${userId}:`)) cache.delete(key);
    }
  }
}

export function clearAccessDirectoryCache(): void {
  cache.clear();
}

/**
 * Resolves the assembly orgs where this user currently holds a live
 * CONCESSION_SUPER_ADMIN grant. The token role claim is deliberately not used:
 * it is a point-in-time snapshot and can be stale until the next refresh.
 */
export async function getAccessibleAssemblies(
  prisma: PrismaClient,
  zitadel: ZitadelProvisioningClient,
  input: {
    userId: string;
    projectId: string;
    concessionId?: string;
    ttlMs?: number;
    now?: () => number;
  },
): Promise<AccessDirectoryEntry[]> {
  const now = input.now ?? Date.now;
  const key = cacheKey(input.userId, input.projectId, input.concessionId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.value;

  const contexts = await prisma.zitadelOrgContext.findMany({
    where: {
      scope: 'ASSEMBLY',
      status: 'ACTIVE',
      assemblyId: { not: null },
      ...(input.concessionId ? { concessionId: input.concessionId } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  const assemblyIds = contexts
    .map((context) => context.assemblyId)
    .filter((id): id is string => typeof id === 'string');
  const assemblies = assemblyIds.length > 0
    ? await prisma.assembly.findMany({
      where: { id: { in: assemblyIds } },
      select: { id: true, assemblyName: true, assemblyCode: true },
    })
    : [];
  const assemblyById = new Map(assemblies.map((assembly) => [assembly.id, assembly]));

  const entries: AccessDirectoryEntry[] = [];
  for (const context of contexts) {
    if (!context.assemblyId) continue;
    const grants = await zitadel.listUserGrants({
      orgId: context.orgId,
      userId: input.userId,
      projectId: input.projectId,
    });
    if (!grants.some((grant) => grant.roleKeys.includes('CONCESSION_SUPER_ADMIN'))) continue;
    const assembly = assemblyById.get(context.assemblyId);
    entries.push({
      orgId: context.orgId,
      assemblyId: context.assemblyId,
      assemblyName: assembly?.assemblyName ?? null,
      assemblyCode: assembly?.assemblyCode ?? null,
      concessionId: context.concessionId,
      primaryDomain: context.primaryDomain,
      role: 'CONCESSION_SUPER_ADMIN',
    });
  }

  cache.set(key, {
    value: entries,
    expiresAt: now() + (input.ttlMs ?? ACCESS_DIRECTORY_DEFAULT_TTL_MS),
  });
  return entries;
}
