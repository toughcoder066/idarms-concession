import { appConfig } from './config';

export interface OrgContext {
  orgId: string;
  concessionId: string;
  assemblyId: string | null;
  scope: 'CONCESSION' | 'ASSEMBLY';
}

// Cached per home org, never per token, with the same short lifetimes as the
// services' copy (scripts/sync-role-model.mjs, ADR-0003).
export const ORG_CONTEXT_TTL_MS = 60 * 1000;
export const ORG_NOT_REGISTERED_TTL_MS = 15 * 1000;
const cache = new Map<string, { value: OrgContext | null; expiresAt: number }>();
// One lookup per org at a time; the answer is about the org, not the user.
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

/**
 * The signed-in user's tenant, from concessions-management's
 * GET /v1/org-context/me. The access token is the one ZITADEL just issued to
 * the portal; concessions-management verifies it and answers only for its own
 * home org. The token is never cached, logged or put in an error. Any failure,
 * or an answer for another org, resolves to null: no tenant.
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

async function fetchOrgContext(homeOrgId: string, accessToken: string): Promise<OrgContext | null> {
  const now = Date.now();
  const base = appConfig.serviceBaseUrls.concessions.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production' && !base.startsWith('https://')) {
    console.error('Refusing the org-context lookup: NEXT_PUBLIC_CONCESSIONS_API_URL must be https:// in production');
    return null;
  }

  try {
    const response = await fetch(`${base}/org-context/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 404) {
      cache.set(homeOrgId, { value: null, expiresAt: now + ORG_NOT_REGISTERED_TTL_MS });
      return null;
    }
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!isOrgContextFor(value, homeOrgId)) return null;
    cache.set(homeOrgId, { value, expiresAt: now + ORG_CONTEXT_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

/** Tests only. */
export function clearOrgContextCache(): void {
  cache.clear();
  inFlight.clear();
}
