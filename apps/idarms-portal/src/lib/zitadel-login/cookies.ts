import 'server-only';
import { cookies } from 'next/headers';
import { decode, encode } from 'next-auth/jwt';

/**
 * Encrypted, httpOnly cookies for the login flow, sealed with AUTH_SECRET by
 * Auth.js's own JWE helpers. They hold ZITADEL session handles, never a
 * password or a code.
 */

/** A password check that passed but must change the password before sign-in completes. */
export const PENDING_COOKIE = 'idarms_login_pending';
/** The ZITADEL session behind the portal session, so sign-out can end it. */
export const ZITADEL_SESSION_COOKIE = 'idarms_zitadel_session';

const PENDING_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface PendingLogin {
  sessionId: string;
  sessionToken: string;
  userId: string;
  orgId: string;
  redirectTo: string;
}

export interface ZitadelSessionHandle {
  sessionId: string;
  sessionToken: string;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET must be set');
  return value;
}

export async function seal(name: string, value: object, maxAgeSeconds: number, key = secret()): Promise<string> {
  return encode({ token: { ...value }, secret: key, salt: name, maxAge: maxAgeSeconds });
}

export async function unseal<T>(name: string, sealed: string | undefined, key = secret()): Promise<T | null> {
  if (!sealed) return null;
  try {
    const decoded = await decode({ token: sealed, secret: key, salt: name });
    return (decoded as T | null) ?? null;
  } catch {
    return null;
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge,
});

export async function setPendingLogin(value: PendingLogin): Promise<void> {
  (await cookies()).set(PENDING_COOKIE, await seal(PENDING_COOKIE, value, PENDING_TTL_SECONDS), cookieOptions(PENDING_TTL_SECONDS));
}

export async function readPendingLogin(): Promise<PendingLogin | null> {
  const pending = await unseal<PendingLogin>(PENDING_COOKIE, (await cookies()).get(PENDING_COOKIE)?.value);
  return pending?.sessionId && pending.sessionToken && pending.userId ? pending : null;
}

export async function clearPendingLogin(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

export async function setZitadelSession(value: ZitadelSessionHandle): Promise<void> {
  const sealed = await seal(ZITADEL_SESSION_COOKIE, { sessionId: value.sessionId, sessionToken: value.sessionToken }, SESSION_TTL_SECONDS);
  (await cookies()).set(ZITADEL_SESSION_COOKIE, sealed, cookieOptions(SESSION_TTL_SECONDS));
}

export async function readZitadelSession(): Promise<ZitadelSessionHandle | null> {
  const handle = await unseal<ZitadelSessionHandle>(ZITADEL_SESSION_COOKIE, (await cookies()).get(ZITADEL_SESSION_COOKIE)?.value);
  return handle?.sessionId && handle.sessionToken ? handle : null;
}

export async function clearZitadelSession(): Promise<void> {
  (await cookies()).delete(ZITADEL_SESSION_COOKIE);
}
