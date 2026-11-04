import 'server-only';
import { decodeAuthSessionCookie } from './preview-session';

/**
 * The signed-in user's ZITADEL access token, for calls from the portal server
 * to iDARMS services. It is read from the encrypted session cookie and is
 * never part of the session the browser can fetch. An ended session has none.
 */
export async function serverAccessToken(): Promise<string | undefined> {
  const token = await decodeAuthSessionCookie();
  if (!token || token.error) return undefined;
  return typeof token.accessToken === 'string' && token.accessToken ? token.accessToken : undefined;
}
