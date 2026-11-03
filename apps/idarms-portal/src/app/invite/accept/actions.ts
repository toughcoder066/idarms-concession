'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginClient } from '@/lib/zitadel-login/client';
import { acceptInvite, passwordRules, unmetRules } from '@/lib/zitadel-login/flows';
import { field, MESSAGES, type AuthFormState } from '@/lib/zitadel-login/form-state';
import { limits } from '@/lib/zitadel-login/rate-limit';
import { clientIp, isZitadelId } from '@/lib/zitadel-login/request';

export async function acceptInviteAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const userId = field(formData, 'userId');
  const code = field(formData, 'code');
  const orgId = field(formData, 'orgId');
  const password = field(formData, 'password');
  if (!isZitadelId(userId) || !code || code.length > 128) return { error: MESSAGES.invalidInviteLink };
  if (password !== field(formData, 'confirm')) return { error: MESSAGES.passwordsDiffer };
  if (!limits.codeByIp.hit(clientIp(await headers()))) return { error: MESSAGES.tooMany };

  const api = loginClient();
  // The invite code is spent once verified, so the rules are checked first.
  const unmet = unmetRules(password, await passwordRules(api, isZitadelId(orgId) ? orgId : undefined));
  if (unmet.length > 0) return { error: `Your password needs ${unmet.join(', ')}.` };

  const result = await acceptInvite(api, userId, code, password);
  if (!result.ok) return { error: result.reason === 'invalid_code' ? MESSAGES.invalidInviteLink : MESSAGES.unavailable };
  redirect('/login?invited=1');
}
