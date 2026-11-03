import 'server-only';
import { signIn } from '@/auth';
import { loginClient } from './client';
import { setZitadelSession } from './cookies';
import { finishAuthRequest, startAuthRequest, type ZitadelSession } from './flows';

/**
 * Turns a checked ZITADEL session into a portal sign-in without the browser
 * visiting ZITADEL (ADR-0004):
 *   1. Auth.js builds the authorization URL and sets its state/PKCE cookies;
 *   2. the server calls ZITADEL's authorize endpoint and gets an auth request;
 *   3. the auth request is completed with the session;
 *   4. the returned URL is the portal's own Auth.js callback with the code,
 *      where Auth.js checks state and PKCE and exchanges the code as before.
 * Returns that callback URL for the caller to redirect to.
 */
export async function completeSignIn(session: ZitadelSession, redirectTo: string): Promise<string> {
  const issuer = process.env.ZITADEL_ISSUER;
  if (!issuer) throw new Error('ZITADEL_ISSUER must be set');

  const authorizationUrl = await signIn('zitadel', { redirect: false, redirectTo });
  if (typeof authorizationUrl !== 'string') throw new Error('Auth.js did not return an authorization URL');
  const redirectUri = new URL(authorizationUrl).searchParams.get('redirect_uri');
  if (!redirectUri) throw new Error('authorization URL has no redirect_uri');

  const authRequestId = await startAuthRequest(authorizationUrl, issuer);
  const callbackUrl = await finishAuthRequest(loginClient(), authRequestId, session, redirectUri);
  await setZitadelSession(session);
  return callbackUrl;
}
