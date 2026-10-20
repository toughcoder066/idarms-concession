import { auth } from '@/auth';
import { appConfig } from './config';
import type { IdarmsResource } from './config';

/**
 * Server-side reads against the local iDARMS services, forwarding the caller's
 * ZITADEL access token. Writes go to the CROIP Apex API (see lib/croip.ts).
 */
export async function idarmsGet<T>(
  resource: IdarmsResource,
  path: string,
): Promise<T | null> {
  const session = await auth();
  const base = appConfig.gatewayUrl || appConfig.serviceBaseUrls[resource];

  const headers: Record<string, string> = { accept: 'application/json' };
  if (session?.accessToken) {
    headers.authorization = `Bearer ${session.accessToken}`;
  }

  try {
    const res = await fetch(`${base}${path}`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
