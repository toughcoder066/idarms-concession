'use server';

import { auth, signOut } from '@/auth';
import { clearPreviewCookie } from '@/lib/preview-session';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function signOutAction() {
  const session = await auth();
  const requestHeaders = await headers();
  const appOrigin = process.env.AUTH_URL
    ?? process.env.NEXTAUTH_URL
    ?? requestHeaders.get('origin');
  if (!appOrigin) {
    throw new Error('The portal origin is unavailable; configure AUTH_URL before signing out.');
  }

  const postLogoutRedirectUri = new URL('/signed-out', appOrigin).toString();
  await clearPreviewCookie();
  await signOut({ redirect: false });

  const idToken = session?.idToken;
  const issuer = process.env.ZITADEL_ISSUER?.replace(/\/+$/, '');
  if (!idToken || !issuer) {
    redirect(postLogoutRedirectUri);
  }

  const logoutUrl = new URL(`${issuer}/oidc/v1/end_session`);
  logoutUrl.searchParams.set('id_token_hint', idToken);
  logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  if (process.env.ZITADEL_CLIENT_ID) {
    logoutUrl.searchParams.set('client_id', process.env.ZITADEL_CLIENT_ID);
  }
  redirect(logoutUrl.toString());
}
