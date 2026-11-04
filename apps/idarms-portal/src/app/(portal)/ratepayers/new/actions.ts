'use server';

import { auth } from '@/auth';
import { idarmsGet } from '@/lib/api';
import { authorizeAssemblyAction } from '@/lib/authorize';
import { registerRatepayer, type RegisterRatepayerInput } from '@/lib/croip';

export interface RegisterResult {
  ok: boolean;
  status?: number;
  message?: string;
}

/**
 * Registers a ratepayer at CROIP for the user's own assembly only. The CROIP
 * assembly id in the form must be the one recorded for that assembly; the
 * form never chooses the tenant.
 */
export async function submitRatepayer(input: RegisterRatepayerInput): Promise<RegisterResult> {
  const authorized = authorizeAssemblyAction(await auth(), 'ratepayer:create');
  if (!authorized.ok) return { ok: false, status: authorized.status, message: authorized.message };

  const assembly = await idarmsGet<{ croipAssemblyId?: string | null }>(
    'concessions',
    `/v1/assemblies/${encodeURIComponent(authorized.access.assemblyId)}`,
  );
  const croipAssemblyId = assembly?.croipAssemblyId?.trim().toLowerCase();
  if (!croipAssemblyId) {
    return { ok: false, status: 409, message: 'Your assembly has no CROIP assembly ID recorded yet, so ratepayers cannot be registered.' };
  }
  if (typeof input?.assemblyId !== 'string' || input.assemblyId.trim().toLowerCase() !== croipAssemblyId) {
    return { ok: false, status: 403, message: 'Ratepayers can only be registered in your own assembly.' };
  }

  const result = await registerRatepayer(input);
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
  };
}
