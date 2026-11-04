import { appConfig } from './config';

export interface OrgContext {
  orgId: string;
  concessionId: string;
  assemblyId: string | null;
  scope: 'CONCESSION' | 'ASSEMBLY';
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: OrgContext | null; expiresAt: number }>();

export async function resolveOrgContext(orgId: string): Promise<OrgContext | null> {
  const now = Date.now();
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const base = appConfig.serviceBaseUrls.concessions.replace(/\/+$/, '');
    const response = await fetch(`${base}/org-context/${encodeURIComponent(orgId)}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 404) {
      cache.set(orgId, { value: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    if (!response.ok) return null;
    const value = await response.json() as OrgContext;
    cache.set(orgId, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}
