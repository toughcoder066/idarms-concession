import { appConfig } from './config';

export interface RegisterRatepayerInput {
  reference: string;
  fullName: string;
  ghanaCardId?: string;
  phone?: string;
  email?: string;
  concessionId: string;
  assemblyId: string;
}

export interface CroipResult {
  ok: boolean;
  status?: number;
  body?: unknown;
}

/**
 * CQRS write: master data creation goes straight to CROIP Apex, bypassing the
 * local iDARMS microservices.
 */
export async function registerRatepayer(input: RegisterRatepayerInput): Promise<CroipResult> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (appConfig.croipApiToken) {
      headers.authorization = `Bearer ${appConfig.croipApiToken}`;
    }

    const res = await fetch(`${appConfig.croipApiUrl}/v1/identity/ratepayers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    const body = await res.json().catch(() => undefined);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, body: err instanceof Error ? err.message : String(err) };
  }
}
