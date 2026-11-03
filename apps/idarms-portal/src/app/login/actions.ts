'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginClient } from '@/lib/zitadel-login/client';
import { setPendingLogin } from '@/lib/zitadel-login/cookies';
import { checkPassword, endSession } from '@/lib/zitadel-login/flows';
import { field, MESSAGES, type AuthFormState } from '@/lib/zitadel-login/form-state';
import { limits } from '@/lib/zitadel-login/rate-limit';
import { clientIp, safeRedirectPath } from '@/lib/zitadel-login/request';
import { completeSignIn } from '@/lib/zitadel-login/sign-in';

export async function loginAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const loginName = field(formData, 'loginName').trim();
  const password = field(formData, 'password');
  const redirectTo = safeRedirectPath(formData.get('redirectTo'));
  if (!loginName || !password) return { error: MESSAGES.missingCredentials };

  const ip = clientIp(await headers());
  if (!limits.loginByIp.hit(ip) || !limits.loginByName.hit(loginName.toLowerCase())) {
    return { error: MESSAGES.tooMany };
  }

  let api: ReturnType<typeof loginClient>;
  try {
    api = loginClient();
  } catch (error) {
    console.error('[login] portal login is not configured', { message: error instanceof Error ? error.message : 'unknown' });
    return { error: MESSAGES.unavailable };
  }

  const check = await checkPassword(api, loginName, password);
  if (!check.ok) {
    return { error: check.reason === 'invalid' ? MESSAGES.invalidCredentials : MESSAGES.unavailable };
  }

  if (check.passwordChangeRequired) {
    await setPendingLogin({
      sessionId: check.sessionId,
      sessionToken: check.sessionToken,
      userId: check.userId,
      orgId: check.orgId,
      redirectTo,
    });
    redirect('/password/change');
  }

  let callbackUrl: string;
  try {
    callbackUrl = await completeSignIn(check, redirectTo);
  } catch (error) {
    console.error('[login] could not complete sign-in', { reason: error instanceof Error ? error.message : 'unknown' });
    await endSession(api, check);
    return { error: MESSAGES.unavailable };
  }
  redirect(callbackUrl);
}
