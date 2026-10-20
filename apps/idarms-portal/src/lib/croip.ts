import 'server-only';

import { appConfig } from './config';
import { getMachineToken } from './m2m';

export interface RegisterRatepayerInput {
  reference: string;
  fullName: string;
  ghanaCardId?: string;
  phone?: string;
  email?: string;
  concessionId: string;
  assemblyId: string;
}

export interface RegisterPropertyInput {
  reference: string;
  ratepayerId: string;
  propertyType: string;
  gpsCoordinates?: string;
  concessionId: string;
  assemblyId: string;
}

export interface CroipResult {
  ok: boolean;
  status?: number;
  body?: unknown;
}

/**
 * CQRS writes: master data creation goes straight to the CROIP Apex API and
 * bypasses the local iDARMS microservices. CROIP's ratepayer-registry and
 * property-registry are the single source of truth for these two entities —
 * the local services only hold a read replica synced back down over RabbitMQ.
 *
 * Server-only: the M2M bearer token (client-credentials against CROIP ZITADEL)
 * must never reach the browser.
 */
async function croipPost(path: string, body: unknown): Promise<CroipResult> {
  try {
    const token = await getMachineToken();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${appConfig.croipApiUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseBody = await res.json().catch(() => undefined);
    return { ok: res.ok, status: res.status, body: responseBody };
  } catch (err) {
    return { ok: false, body: err instanceof Error ? err.message : String(err) };
  }
}

export function registerRatepayer(input: RegisterRatepayerInput): Promise<CroipResult> {
  return croipPost('/v1/identity/ratepayers', input);
}

export function registerProperty(input: RegisterPropertyInput): Promise<CroipResult> {
  return croipPost('/v1/properties', input);
}
