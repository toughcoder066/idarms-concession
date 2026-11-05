import { config } from '../config';

export interface OrgContext {
  orgId: string;
  concessionId: string;
  assemblyId: string | null;
  scope: 'CONCESSION' | 'ASSEMBLY';
}

// Cached per verified home org, never per token. The short lifetimes bound how long a
// registry row that was removed or changed can still be served (ADR-0003).
export const ORG_CONTEXT_TTL_MS = 60 * 1000;
export const ORG_NOT_REGISTERED_TTL_MS = 15 * 1000;
const cache = new Map<string, { value: OrgContext | null; expiresAt: number }>();
// One lookup per org at a time. Sharing it between callers is safe: each caller's
// token was verified before it got here, and the answer is about the org, not the user.
const inFlight = new Map<string, Promise<OrgContext | null>>();

function isOrgContextFor(value: unknown, orgId: string): value is OrgContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as Record<string, unknown>;
  if (context.orgId !== orgId) return false;
  if (typeof context.concessionId !== 'string' || context.concessionId === '') return false;
  if (context.scope === 'CONCESSION') return context.assemblyId === null;
  if (context.scope === 'ASSEMBLY') return typeof context.assemblyId === 'string' && context.assemblyId !== '';
  return false;
}

async function fetchOrgContext(homeOrgId: string, accessToken: string): Promise<OrgContext | null> {
  try {
    let base = config.orgContextUrl;
    while (base.endsWith('/')) base = base.slice(0, -1);
    const response = await fetch(base + '/v1/org-context/me', {
      headers: { authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 404) {
      cache.set(homeOrgId, { value: null, expiresAt: Date.now() + ORG_NOT_REGISTERED_TTL_MS });
      return null;
    }
    // Other failures are never cached: a short outage must not lock users out.
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!isOrgContextFor(value, homeOrgId)) return null;
    cache.set(homeOrgId, { value, expiresAt: Date.now() + ORG_CONTEXT_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

/**
 * The caller's own tenant, from the org registry in concessions-management
 * (GET /v1/org-context/me). homeOrgId must be the home organisation claim of the
 * verified token, and accessToken that same token: concessions-management verifies
 * it again and answers only for the token's own home org. The token is sent once
 * and is never cached, logged or put in an error. Any failure, or an answer for a
 * different org, resolves to null, so the caller gets no tenant.
 */
export async function resolveOrgContext(homeOrgId: string, accessToken: string): Promise<OrgContext | null> {
  const cached = cache.get(homeOrgId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlight.get(homeOrgId);
  if (pending) return pending;

  const lookup = fetchOrgContext(homeOrgId, accessToken).finally(() => inFlight.delete(homeOrgId));
  inFlight.set(homeOrgId, lookup);
  return lookup;
}

/** Tests only. */
export function clearOrgContextCache(): void {
  cache.clear();
  inFlight.clear();
}
