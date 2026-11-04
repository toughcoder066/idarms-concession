// Generated from packages/contracts/src/roles.ts. Do not edit by hand.
// Run `node scripts/sync-role-model.mjs` after changing the canonical model.
import { config } from '../config';

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
    const base = config.orgContextUrl.replace(/\/+$/, '');
    const response = await fetch(`${base}/v1/org-context/${encodeURIComponent(orgId)}`, {
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
