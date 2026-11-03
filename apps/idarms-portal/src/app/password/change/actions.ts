'use server';

import { redirect } from 'next/navigation';
import { loginClient } from '@/lib/zitadel-login/client';
import { clearPendingLogin, readPendingLogin } from '@/lib/zitadel-login/cookies';
import { passwordRules, replaceRequiredPassword, unmetRules } from '@/lib/zitadel-login/flows';
import { field, MESSAGES, type AuthFormState } from '@/lib/zitadel-login/form-state';
import { completeSignIn } from '@/lib/zitadel-login/sign-in';

/** The password change ZITADEL requires before this sign-in may complete. */
export async function changeRequiredPasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const pending = await readPendingLogin();
  if (!pending) redirect('/login?expired=1');

  const password = field(formData, 'password');
  if (password !== field(formData, 'confirm')) return { error: MESSAGES.passwordsDiffer };

  const api = loginClient();
  const unmet = unmetRules(password, await passwordRules(api, pending.orgId));
  if (unmet.length > 0) return { error: `Your new password needs ${unmet.join(', ')}.` };

  const result = await replaceRequiredPassword(api, pending.userId, password);
  if (!result.ok) return { error: MESSAGES.unavailable };
  await clearPendingLogin();

  let callbackUrl: string;
  try {
    callbackUrl = await completeSignIn(pending, pending.redirectTo);
  } catch (error) {
    console.warn('[login] sign-in after password change did not complete', { reason: error instanceof Error ? error.message : 'unknown' });
    redirect('/login?changed=1');
  }
  redirect(callbackUrl);
}
