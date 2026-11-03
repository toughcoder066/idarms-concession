import 'server-only';
import { ZitadelApiError, type LoginApi } from './client';

/**
 * The portal-hosted login against ZITADEL's v2 APIs (ADR-0004). Every check
 * of a password, reset code or invite code happens in ZITADEL; the portal only
 * sequences the calls. Because the login client may set any user's password,
 * a new password is only ever set right after ZITADEL accepted a code, or for
 * a user whose password ZITADEL has just checked.
 */

export interface ZitadelSession {
  sessionId: string;
  sessionToken: string;
}

export type PasswordCheck =
  | (ZitadelSession & { ok: true; userId: string; orgId: string; passwordChangeRequired: boolean })
  | { ok: false; reason: 'invalid' | 'unavailable' };

export type CodeResult = { ok: true } | { ok: false; reason: 'invalid_code' | 'unavailable' };

export class LoginUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginUnavailableError';
  }
}

const isClientError = (error: unknown) => error instanceof ZitadelApiError && error.status >= 400 && error.status < 500;

/**
 * Checks a login name and password by creating a ZITADEL session. A wrong
 * password, an unknown user and a locked or uninitialised account all come
 * back as `invalid`, so the response never tells whether an account exists.
 */
export async function checkPassword(api: LoginApi, loginName: string, password: string): Promise<PasswordCheck> {
  let session: ZitadelSession | undefined;
  try {
    const created = await api.call<{ sessionId?: string; sessionToken?: string }>('POST', '/v2/sessions', {
      checks: { user: { loginName }, password: { password } },
    });
    if (!created?.sessionId || !created.sessionToken) return { ok: false, reason: 'unavailable' };
    session = { sessionId: created.sessionId, sessionToken: created.sessionToken };

    const details = await api.call<any>('GET', `/v2/sessions/${encodeURIComponent(session.sessionId)}`);
    const userId = details?.session?.factors?.user?.id;
    const orgId = details?.session?.factors?.user?.organizationId;
    if (typeof userId !== 'string' || typeof orgId !== 'string') throw new LoginUnavailableError('session without a user');

    const user = await api.call<any>('GET', `/v2/users/${encodeURIComponent(userId)}`);
    // ZITADEL omits false booleans from the JSON, so a missing flag means false.
    const passwordChangeRequired = user?.user?.human?.passwordChangeRequired === true;
    return { ok: true, ...session, userId, orgId, passwordChangeRequired };
  } catch (error) {
    if (session) await endSession(api, session);
    return { ok: false, reason: isClientError(error) ? 'invalid' : 'unavailable' };
  }
}

/**
 * Asks ZITADEL's authorize endpoint for an auth request on the server, so the
 * browser never visits ZITADEL. Returns the auth request id from its redirect.
 */
export async function startAuthRequest(authorizationUrl: string, issuer: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = new URL(authorizationUrl);
  if (url.origin !== new URL(issuer).origin || url.pathname !== '/oauth/v2/authorize') {
    throw new LoginUnavailableError('authorization URL is not the configured ZITADEL issuer');
  }
  const response = await fetchImpl(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  const location = response.headers.get('location');
  const authRequestId = location ? new URL(location, url).searchParams.get('authRequest') : null;
  if (!authRequestId || !/^V2_\d+$/.test(authRequestId)) {
    throw new LoginUnavailableError(`authorize did not return an auth request (HTTP ${response.status})`);
  }
  return authRequestId;
}

/**
 * Completes the auth request with a checked session. ZITADEL answers with the
 * portal callback carrying the code; anything else is refused.
 */
export async function finishAuthRequest(
  api: LoginApi,
  authRequestId: string,
  session: ZitadelSession,
  expectedRedirectUri: string,
): Promise<string> {
  const result = await api.call<{ callbackUrl?: string }>('POST', `/v2/oidc/auth_requests/${encodeURIComponent(authRequestId)}`, {
    session: { sessionId: session.sessionId, sessionToken: session.sessionToken },
  });
  const callback = result?.callbackUrl ? new URL(result.callbackUrl) : null;
  const expected = new URL(expectedRedirectUri);
  if (!callback || callback.origin !== expected.origin || callback.pathname !== expected.pathname || !callback.searchParams.has('code')) {
    throw new LoginUnavailableError('auth request did not return the portal callback');
  }
  return callback.toString();
}

/** Ends a ZITADEL session. Best effort: sign-out must still finish locally. */
export async function endSession(api: LoginApi, session: ZitadelSession): Promise<void> {
  try {
    await api.call('DELETE', `/v2/sessions/${encodeURIComponent(session.sessionId)}`, { sessionToken: session.sessionToken });
  } catch {
    // Already gone or expired.
  }
}

/**
 * Emails a reset link pointing at the portal. Always resolves the same way,
 * whether or not the account exists. The link base is the configured portal
 * URL, never a request header.
 */
export async function requestPasswordReset(api: LoginApi, loginName: string, portalUrl: string): Promise<void> {
  try {
    const found = await api.call<{ result?: Array<{ userId?: string }> }>('POST', '/v2/users', {
      queries: [{ loginNameQuery: { loginName, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
    });
    const userId = found?.result?.length === 1 ? found.result[0]?.userId : undefined;
    if (!userId) return;
    await api.call('POST', `/v2/users/${encodeURIComponent(userId)}/password_reset`, {
      sendLink: {
        notificationType: 'NOTIFICATION_TYPE_Email',
        urlTemplate: `${portalUrl.replace(/\/+$/, '')}/password/reset?userId={{.UserID}}&code={{.Code}}&orgId={{.OrgID}}`,
      },
    });
  } catch (error) {
    console.warn('[login] password reset request failed', {
      status: error instanceof ZitadelApiError ? error.status : undefined,
    });
  }
}

/** Sets a new password with the code from a reset email. */
export async function resetPassword(api: LoginApi, userId: string, code: string, newPassword: string): Promise<CodeResult> {
  try {
    await api.call('POST', `/v2/users/${encodeURIComponent(userId)}/password`, {
      newPassword: { password: newPassword, changeRequired: false },
      verificationCode: code,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isClientError(error) ? 'invalid_code' : 'unavailable' };
  }
}

/**
 * Accepts an invitation: ZITADEL checks the invite code first, and only then
 * is the first password set. A rejected code never leads to a password write.
 */
export async function acceptInvite(api: LoginApi, userId: string, code: string, newPassword: string): Promise<CodeResult> {
  try {
    await api.call('POST', `/v2/users/${encodeURIComponent(userId)}/invite_code/verify`, { verificationCode: code });
  } catch (error) {
    return { ok: false, reason: isClientError(error) ? 'invalid_code' : 'unavailable' };
  }
  try {
    await api.call('POST', `/v2/users/${encodeURIComponent(userId)}/password`, {
      newPassword: { password: newPassword, changeRequired: false },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * The forced change after login. Only for a user whose password ZITADEL just
 * checked (the pending sign-in): a reset code is issued to the server and
 * used at once, so the user is not asked for the old password again.
 */
export async function replaceRequiredPassword(api: LoginApi, userId: string, newPassword: string): Promise<CodeResult> {
  try {
    const issued = await api.call<{ verificationCode?: string }>('POST', `/v2/users/${encodeURIComponent(userId)}/password_reset`, {
      returnCode: {},
    });
    if (!issued?.verificationCode) return { ok: false, reason: 'unavailable' };
    return await resetPassword(api, userId, issued.verificationCode, newPassword);
  } catch (error) {
    return { ok: false, reason: isClientError(error) ? 'invalid_code' : 'unavailable' };
  }
}

export interface PasswordRules {
  minLength: number;
  requiresUppercase: boolean;
  requiresLowercase: boolean;
  requiresNumber: boolean;
  requiresSymbol: boolean;
}

/** Used only when ZITADEL's settings cannot be read; ZITADEL still enforces its own. */
export const FALLBACK_RULES: PasswordRules = {
  minLength: 8,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
  requiresSymbol: true,
};

/** ZITADEL's password complexity settings for the organisation (or the instance). */
export async function passwordRules(api: LoginApi, orgId?: string): Promise<PasswordRules> {
  try {
    const query = orgId && /^\d+$/.test(orgId) ? `?ctx.orgId=${orgId}` : '';
    const body = await api.call<{ settings?: Record<string, unknown> }>('GET', `/v2/settings/password/complexity${query}`);
    const s = body?.settings ?? {};
    return {
      minLength: Number(s.minLength ?? FALLBACK_RULES.minLength) || FALLBACK_RULES.minLength,
      requiresUppercase: s.requiresUppercase === true,
      requiresLowercase: s.requiresLowercase === true,
      requiresNumber: s.requiresNumber === true,
      requiresSymbol: s.requiresSymbol === true,
    };
  } catch {
    return FALLBACK_RULES;
  }
}

/**
 * The rules a password does not meet, checked before any code is spent:
 * an invite code is consumed when verified, so a weak password must be
 * caught first.
 */
export function unmetRules(password: string, rules: PasswordRules): string[] {
  const unmet: string[] = [];
  if (password.length < rules.minLength) unmet.push(`at least ${rules.minLength} characters`);
  if (rules.requiresUppercase && !/[A-Z]/.test(password)) unmet.push('an uppercase letter');
  if (rules.requiresLowercase && !/[a-z]/.test(password)) unmet.push('a lowercase letter');
  if (rules.requiresNumber && !/\d/.test(password)) unmet.push('a number');
  if (rules.requiresSymbol && !/[^A-Za-z0-9]/.test(password)) unmet.push('a symbol');
  return unmet;
}

export function describeRules(rules: PasswordRules): string {
  const parts = [`at least ${rules.minLength} characters`];
  if (rules.requiresUppercase) parts.push('an uppercase letter');
  if (rules.requiresLowercase) parts.push('a lowercase letter');
  if (rules.requiresNumber) parts.push('a number');
  if (rules.requiresSymbol) parts.push('a symbol');
  return `Use ${parts.join(', ')}.`;
}
