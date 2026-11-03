'use server';

import { headers } from 'next/headers';
import { loginClient } from '@/lib/zitadel-login/client';
import { requestPasswordReset } from '@/lib/zitadel-login/flows';
import { field, MESSAGES, type AuthFormState } from '@/lib/zitadel-login/form-state';
import { limits } from '@/lib/zitadel-login/rate-limit';
import { clientIp, portalUrl } from '@/lib/zitadel-login/request';

/** Always answers "sent", so the form never tells whether an account exists. */
export async function forgotPasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const loginName = field(formData, 'loginName').trim();
  if (!loginName) return { error: 'Enter your username or email address.' };
  if (!limits.forgotByIp.hit(clientIp(await headers()))) return { error: MESSAGES.tooMany };

  if (limits.forgotByName.hit(loginName.toLowerCase())) {
    try {
      await requestPasswordReset(loginClient(), loginName, portalUrl());
    } catch (error) {
      console.error('[login] password reset is not configured', { message: error instanceof Error ? error.message : 'unknown' });
    }
  }
  return { sent: true };
}
