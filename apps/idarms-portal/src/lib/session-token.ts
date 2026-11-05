import { capabilitiesForRoles, parseRoleGrants, rolesInOrg } from '@idarms/contracts';
import { resolveOrgContext, type OrgContext } from './org-context';

/**
 * Why a session can no longer be used. Either one ends the session for good:
 * the user is signed out everywhere and has to sign in again.
 *   RefreshFailed: the access token expired and ZITADEL would not refresh it.
 *   NoRoles: the user holds no iDARMS role in their home organisation.
 */
export type SessionError = 'RefreshFailed' | 'NoRoles';

/** What the portal keeps in its encrypted session cookie. Never sent to the browser as JSON. */
export interface AppToken {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: SessionError;
  userId?: string;
  roles?: string[];
  permissions?: string[];
  scopeLevel?: string;
  assemblyIds?: string[];
  concessionId?: string;
  assemblyId?: string;
}

type JwtPayload = Record<string, unknown>;

export function decodeJwt(token?: string): JwtPayload | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const normalized = part.replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }
}

const RESOURCE_OWNER_CLAIM = 'urn:zitadel:iam:user:resourceowner:id';

/**
 * The user's roles, counted only in their home organisation. The home org
 * comes from ZITADEL's resource-owner claim and is never guessed; without it
 * there are no roles, and the services refuse such a token too.
 */
export function rolesFromAccessToken(accessToken?: string): { userId?: string; homeOrgId?: string; roles: string[] } {
  const payload = decodeJwt(accessToken);
  if (!payload) return { roles: [] };
  const resourceOwner = payload[RESOURCE_OWNER_CLAIM];
  const homeOrgId = typeof resourceOwner === 'string' && resourceOwner ? resourceOwner : undefined;
  const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
  if (!homeOrgId) {
    console.warn('[auth] Access token has no home organisation claim; session gets no roles.', {
      subject: userId,
      missingClaim: RESOURCE_OWNER_CLAIM,
      claimsPresent: Object.keys(payload),
    });
  }
  const grants = parseRoleGrants(payload, process.env.ZITADEL_PROJECT_ID);
  return { userId, homeOrgId, roles: rolesInOrg(grants, homeOrgId) };
}

export interface SessionClaims {
  userId?: string;
  roles: string[];
  permissions: string[];
  concessionId?: string;
  assemblyId?: string;
  assemblyIds: string[];
  scopeLevel?: string;
}

/**
 * Session claims from the access token the portal received from ZITADEL's
 * token endpoint (server side, never from the browser). It is decoded here,
 * not verified; concessions-management and every service verify it. The tenant and scope
 * level come from the org registry, exactly as the services read them; a
 * missing registry entry means no tenant, never a guessed one.
 */
export async function claimsFromAccessToken(
  accessToken?: string,
  lookup: (homeOrgId: string, accessToken: string) => Promise<OrgContext | null> = resolveOrgContext,
): Promise<SessionClaims> {
  const { userId, homeOrgId, roles } = rolesFromAccessToken(accessToken);
  // The lookup sends the same token, so concessions-management can only answer
  // for this user's own home org.
  const orgContext = accessToken && homeOrgId && roles.length > 0 ? await lookup(homeOrgId, accessToken) : null;
  return {
    userId,
    roles,
    permissions: capabilitiesForRoles(roles),
    concessionId: orgContext?.concessionId,
    assemblyId: orgContext?.assemblyId ?? undefined,
    assemblyIds: orgContext?.assemblyId ? [orgContext.assemblyId] : [],
    scopeLevel: orgContext?.scope,
  };
}

const REFRESH_MARGIN_SECONDS = 30;

function issuerConfig() {
  const issuer = process.env.ZITADEL_ISSUER?.replace(/\/+$/, '');
  const clientId = process.env.ZITADEL_CLIENT_ID;
  const clientSecret = process.env.ZITADEL_CLIENT_SECRET;
  return issuer && clientId && clientSecret ? { issuer, clientId, clientSecret } : null;
}

/**
 * Refreshes the access token shortly before it expires. A failed refresh
 * never keeps the stale token: the token is marked RefreshFailed and the
 * session ends (see endedToken).
 */
export async function refreshAccessToken(
  token: AppToken,
  fetchImpl: typeof fetch = fetch,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AppToken> {
  if (token.error) return token;
  if (!token.expiresAt || token.expiresAt > nowSeconds + REFRESH_MARGIN_SECONDS) return token;

  const config = issuerConfig();
  if (!token.refreshToken || !config) {
    console.warn('[auth] Access token expired and cannot be refreshed; ending the session.', {
      subject: token.userId,
      hasRefreshToken: Boolean(token.refreshToken),
    });
    return { ...token, error: 'RefreshFailed' };
  }

  try {
    const response = await fetchImpl(`${config.issuer}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const refreshed = await response.json().catch(() => ({})) as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!response.ok || !refreshed.access_token) {
      console.warn('[auth] Token refresh was refused; ending the session.', {
        subject: token.userId,
        status: response.status,
        error: refreshed.error,
      });
      return { ...token, error: 'RefreshFailed' };
    }
    return {
      ...token,
      accessToken: refreshed.access_token,
      idToken: refreshed.id_token ?? token.idToken,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      expiresAt: refreshed.expires_in ? nowSeconds + refreshed.expires_in : token.expiresAt,
    };
  } catch (error) {
    console.warn('[auth] Token refresh failed; ending the session.', {
      subject: token.userId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return { ...token, error: 'RefreshFailed' };
  }
}

/** A token that can no longer act: every credential and claim is dropped, only the reason stays. */
export function endedToken(token: AppToken, error: SessionError): AppToken {
  return {
    error,
    userId: token.userId,
    // Kept only so sign-out can revoke it at ZITADEL.
    refreshToken: token.refreshToken,
    roles: [],
    permissions: [],
    assemblyIds: [],
  };
}

/** Where a session that has ended sends the browser: the sign-out route, which clears everything. */
export function sessionEndPath(error: SessionError): string {
  return `/session/end?reason=${error === 'NoRoles' ? 'no_access' : 'session_ended'}`;
}
