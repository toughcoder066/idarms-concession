'use server';

import { registerProperty, type RegisterPropertyInput } from '@/lib/croip';

export interface RegisterPropertyResult {
  ok: boolean;
  status?: number;
}

export async function submitProperty(input: RegisterPropertyInput): Promise<RegisterPropertyResult> {
  const result = await registerProperty(input);
  return { ok: result.ok, status: result.status };
}
