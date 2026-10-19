import { appConfig } from './config';

/**
 * Server-side reads against the local iDARMS services.
 * Writes must go directly to the CROIP Apex API (see lib/croip.ts).
 */
export async function idarmsGet<T>(path: string, revalidateSeconds = 30): Promise<T | null> {
  try {
    const res = await fetch(`${appConfig.idarmsApiUrl}${path}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
