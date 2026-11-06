'use server';

import { auth } from '@/auth';
import { idarmsGet } from '@/lib/api';
import { authorizeAssemblyAction } from '@/lib/authorize';
import { registerProperty, type RegisterPropertyInput } from '@/lib/croip';

export interface RegisterPropertyResult {
  ok: boolean;
  status?: number;
  message?: string;
  /** CROIP's record, shown to the user only. The replica fills from the sync. */
  property?: { id: string; code: string; assemblyId: string };
  /** CROIP placed the polygon in an assembly other than the user's own. */
  assemblyMismatch?: boolean;
}

/**
 * Registers a property at CROIP. CROIP places it in an assembly from its
 * polygon and refuses polygons outside the concession's assemblies. The
 * staff reference is the signed-in user's iDARMS id, never a form value.
 */
export async function submitProperty(input: RegisterPropertyInput): Promise<RegisterPropertyResult> {
  const authorized = authorizeAssemblyAction(await auth(), 'property:create');
  if (!authorized.ok) return { ok: false, status: authorized.status, message: authorized.message };

  const staffRef = authorized.access.userId;
  if (!staffRef) return { ok: false, status: 401, message: 'Your session has no staff identity. Sign in again.' };

  // CROIP takes no assembly on this call, so the user's own assembly is only
  // used to check where CROIP put the property.
  const assembly = await idarmsGet<{ croipAssemblyId?: string | null }>(
    'concessions',
    `/v1/assemblies/${encodeURIComponent(authorized.access.assemblyId)}`,
  );
  const croipAssemblyId = assembly?.croipAssemblyId?.trim().toLowerCase();
  if (!croipAssemblyId) {
    return { ok: false, status: 409, message: 'Your assembly has no CROIP assembly ID recorded yet, so properties cannot be registered.' };
  }

  const result = await registerProperty(input, staffRef);
  if (!result.ok) return { ok: false, status: result.status, message: result.message };

  const created = result.body as { id?: unknown; code?: unknown; assemblyId?: unknown } | undefined;
  const property = typeof created?.id === 'string' && typeof created.code === 'string' && typeof created.assemblyId === 'string'
    ? { id: created.id, code: created.code, assemblyId: created.assemblyId }
    : undefined;
  return {
    ok: true,
    status: result.status,
    property,
    assemblyMismatch: property ? property.assemblyId.toLowerCase() !== croipAssemblyId : undefined,
  };
}
