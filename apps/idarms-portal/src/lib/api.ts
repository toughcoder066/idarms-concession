import { appConfig } from './config';
import type { IdarmsResource } from './config';

/**
 * Server-side reads against the local iDARMS services.
 * Writes must go directly to the CROIP Apex API (see lib/croip.ts).
 */
export async function idarmsGet<T>(
  resource: IdarmsResource,
  path: string,
  revalidateSeconds = 30,
): Promise<T | null> {
  const base = appConfig.gatewayUrl || appConfig.serviceBaseUrls[resource];

  try {
    const res = await fetch(`${base}${path}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
