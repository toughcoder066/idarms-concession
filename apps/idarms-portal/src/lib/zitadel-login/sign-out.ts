import 'server-only';
import { signOut } from '@/auth';
import { clearPreviewCookie, decodeAuthSessionCookie } from '@/lib/preview-session';
import { loginClient } from './client';
import { clearPendingLogin, clearZitadelSession, readZitadelSession } from './cookies';
import { endSession } from './flows';
import { revokeRefreshToken } from './revoke';

/**
 * Ends the portal session entirely on the server (ADR-0004): ends the ZITADEL
 * session, revokes the refresh token and clears the portal cookies. The
 * browser never visits ZITADEL's logout page.
 */
export async function endPortalSession(): Promise<void> {
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
}
