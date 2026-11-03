'use server';

import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { decodeAuthSessionCookie, clearPreviewCookie } from '@/lib/preview-session';
import { loginClient } from '@/lib/zitadel-login/client';
import { clearPendingLogin, clearZitadelSession, readZitadelSession } from '@/lib/zitadel-login/cookies';
import { endSession } from '@/lib/zitadel-login/flows';

/** Revokes the refresh token at ZITADEL. Best effort; sign-out still completes. */
async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const issuer = process.env.ZITADEL_ISSUER?.replace(/\/+$/, '');
  const clientId = process.env.ZITADEL_CLIENT_ID;
  const clientSecret = process.env.ZITADEL_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return;
  try {
    await fetch(`${issuer}/oauth/v2/revoke`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // ZITADEL unreachable: the session below still ends locally.
  }
}

/**
 * Signs out entirely on the server (ADR-0004): ends the ZITADEL session,
 * revokes the refresh token and clears the portal cookies. The browser never
 * visits ZITADEL's logout page.
 */
export async function signOutAction() {
  const zitadelSession = await readZitadelSession();
  if (zitadelSession) {
    try {
      await endSession(loginClient(), zitadelSession);
    } catch {
      // Login client not configured; the cookies are still cleared below.
    }
  }
  const refreshToken = (await decodeAuthSessionCookie())?.refreshToken;
  if (typeof refreshToken === 'string' && refreshToken) await revokeRefreshToken(refreshToken);

  await clearZitadelSession();
  await clearPendingLogin();
  await clearPreviewCookie();
  await signOut({ redirect: false });
  redirect('/signed-out');
}
