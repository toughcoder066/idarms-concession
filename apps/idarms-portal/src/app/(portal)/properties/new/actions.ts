'use server';

import { auth } from '@/auth';
import { authorizeAssemblyAction } from '@/lib/authorize';
import { registerProperty, type RegisterPropertyInput } from '@/lib/croip';

export interface RegisterPropertyResult {
  ok: boolean;
  status?: number;
  message?: string;
}

/**
 * Registers a property at CROIP. CROIP places it in an assembly from its
 * polygon and refuses polygons outside the concession's assemblies.
 */
export async function submitProperty(input: RegisterPropertyInput): Promise<RegisterPropertyResult> {
  const authorized = authorizeAssemblyAction(await auth(), 'property:create');
  if (!authorized.ok) return { ok: false, status: authorized.status, message: authorized.message };

  const result = await registerProperty(input);
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
  };
}
