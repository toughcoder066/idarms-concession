'use server';

import { registerRatepayer, type RegisterRatepayerInput } from '@/lib/croip';

export interface RegisterResult {
  ok: boolean;
  status?: number;
  message?: string;
}

export async function submitRatepayer(input: RegisterRatepayerInput): Promise<RegisterResult> {
  const result = await registerRatepayer(input);
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
  };
}
