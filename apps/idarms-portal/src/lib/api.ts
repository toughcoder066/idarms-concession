import { auth } from '@/auth';
import { appConfig } from './config';
import type { IdarmsResource } from './config';

export interface IdarmsResponse<T> {
  ok: boolean;
  status: number;
  code?: string;
  data?: T;
  message?: string;
}

async function requestHeaders(json = false): Promise<Record<string, string>> {
  const session = await auth();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (json) headers['content-type'] = 'application/json';

  if (session?.accessToken) {
    headers.authorization = `Bearer ${session.accessToken}`;
  } else if (process.env.NODE_ENV !== 'production') {
    headers['x-idarms-concession-id'] = appConfig.devConcessionId;
    headers['x-idarms-roles'] = appConfig.devRoles;
    headers['x-idarms-actor-id'] = appConfig.devActorId;
    headers['x-idarms-scope-level'] = appConfig.devScopeLevel;
    if (appConfig.devAssemblyId) headers['x-idarms-assembly-id'] = appConfig.devAssemblyId;
    if (appConfig.devOrgId) headers['x-idarms-org-id'] = appConfig.devOrgId;
    if (appConfig.devAuthorizedOrgIds) {
      headers['x-idarms-authorized-org-ids'] = appConfig.devAuthorizedOrgIds;
    }
  }
  return headers;
}

/**
 * Server-side request against a local iDARMS service. Reads forward the
 * caller's ZITADEL access token; master-data writes go to CROIP (lib/croip.ts).
 */
export async function idarmsRequest<T>(
  resource: IdarmsResource,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<IdarmsResponse<T>> {
  const base = appConfig.gatewayUrl || appConfig.serviceBaseUrls[resource];
  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: await requestHeaders(init.body !== undefined),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const payload = await res.json().catch(() => null) as { message?: string; error?: string; data?: T } | T | null;
    if (!res.ok) {
      const code = payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: string }).error ?? '')
        : undefined;
      const message = payload && typeof payload === 'object' && ('message' in payload || 'error' in payload)
        ? String((payload as { message?: string; error?: string }).message ?? (payload as { error?: string }).error)
        : `Service request failed (${res.status}).`;
      return { ok: false, status: res.status, code, message };
    }
    const data = payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: T }).data
      : payload as T;
    return { ok: true, status: res.status, data: data ?? undefined };
  } catch {
    return { ok: false, status: 0, message: `${resource} service is unavailable.` };
  }
}

export async function idarmsGet<T>(
  resource: IdarmsResource,
  path: string,
): Promise<T | null> {
  const result = await idarmsRequest<T>(resource, path);
  return result.ok ? (result.data ?? null) : null;
}
