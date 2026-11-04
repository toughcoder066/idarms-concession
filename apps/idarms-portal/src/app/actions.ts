'use server';

import { redirect } from 'next/navigation';
import { endPortalSession } from '@/lib/zitadel-login/sign-out';

/** The sign-out button: ends the session everywhere, then confirms it. */
export async function signOutAction() {
  await endPortalSession();
  redirect('/signed-out');
}
