import { capabilitiesForRoles, parseRoleGrants } from '@idarms/contracts';
import NextAuth from 'next-auth';
import Zitadel from 'next-auth/providers/zitadel';
import { resolveOrgContext } from './lib/org-context';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    idToken?: string;
    userId?: string;
    roles: string[];
    permissions: string[];
    scopeLevel?: string;
    assemblyIds: string[];
    concessionId?: string;
    assemblyId?: string;
  }
}

interface AppToken {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
  roles?: string[];
  permissions?: string[];
  scopeLevel?: string;
  assemblyIds?: string[];
  concessionId?: string;
  assemblyId?: string;
}

interface JwtPayload {
  [key: string]: unknown;
}

function decodeJwt(token?: string): JwtPayload | null {
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

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>);
  return [];
}

async function claimsFromAccessToken(accessToken?: string) {
  const payload = decodeJwt(accessToken);
  if (!payload) return null;

  const roleGrants = parseRoleGrants(payload);
  const roles = [...new Set(roleGrants.map((grant) => grant.role))];
  const explicitPermissions = stringArray(payload['urn:idarms:permissions']);
  const permissions = [...new Set([...capabilitiesForRoles(roles), ...explicitPermissions])];
  const resourceOwnerId = typeof payload['urn:zitadel:iam:user:resourceowner:id'] === 'string'
    ? payload['urn:zitadel:iam:user:resourceowner:id']
    : undefined;
  // Local ZITADEL access tokens may omit the resource-owner claim. Assembly
  // Admins still carry their org in the ASSEMBLY_ADMIN role grant, which is
  // sufficient to resolve their assembly context from the registry.
  const assemblyAdminOrgId = roleGrants.find((grant) => grant.role === 'ASSEMBLY_ADMIN')?.orgId;
  const homeOrgId = resourceOwnerId ?? assemblyAdminOrgId;
  const orgContext = homeOrgId ? await resolveOrgContext(homeOrgId) : null;
  const isSuperAdmin = roles.includes('CONCESSION_SUPER_ADMIN');
  const hasAssemblyRole = roles.includes('ASSEMBLY_ADMIN');

  return {
    userId: typeof payload.sub === 'string' ? payload.sub : undefined,
    roles,
    permissions,
    concessionId: orgContext?.concessionId,
    assemblyId: orgContext?.assemblyId ?? undefined,
    assemblyIds: orgContext?.assemblyId ? [orgContext.assemblyId] : [],
    scopeLevel: isSuperAdmin && !hasAssemblyRole
      ? 'PORTFOLIO'
      : orgContext?.scope ?? (isSuperAdmin ? 'PORTFOLIO' : 'ASSEMBLY'),
  };
}

async function refreshAccessToken(token: AppToken): Promise<AppToken> {
  if (!token.refreshToken || !process.env.ZITADEL_ISSUER || !process.env.ZITADEL_CLIENT_ID || !process.env.ZITADEL_CLIENT_SECRET) {
    return token;
  }
  if (token.expiresAt && token.expiresAt > Date.now() / 1000 + 30) return token;

  try {
    const response = await fetch(`${process.env.ZITADEL_ISSUER.replace(/\/+$/, '')}/oauth/v2/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: process.env.ZITADEL_CLIENT_ID,
        client_secret: process.env.ZITADEL_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const refreshed = await response.json() as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!response.ok || !refreshed.access_token) return token;
    return {
      ...token,
      accessToken: refreshed.access_token,
      idToken: refreshed.id_token ?? token.idToken,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      expiresAt: refreshed.expires_in ? Math.floor(Date.now() / 1000) + refreshed.expires_in : token.expiresAt,
    };
  } catch {
    return token;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Zitadel({
      issuer: process.env.ZITADEL_ISSUER,
      clientId: process.env.ZITADEL_CLIENT_ID,
      clientSecret: process.env.ZITADEL_CLIENT_SECRET,
      authorization: {
        params: { scope: 'openid profile email offline_access' },
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    async jwt({ token, account }) {
      const app = token as typeof token & AppToken;
      if (account) {
        app.accessToken = account.access_token;
        app.idToken = account.id_token;
        app.refreshToken = account.refresh_token;
        app.expiresAt = account.expires_at;
      }

      const refreshed = await refreshAccessToken(app);
      Object.assign(app, refreshed);

      const claims = await claimsFromAccessToken(app.accessToken);
      if (claims) {
        app.userId = claims.userId;
        app.roles = claims.roles;
        app.permissions = claims.permissions;
        app.concessionId = claims.concessionId;
        app.assemblyId = claims.assemblyId;
        app.assemblyIds = claims.assemblyIds;
        app.scopeLevel = claims.scopeLevel;
      }

      // Keep the identity fields fresh on the session token so the portal can
      // always show the user's real name/email, even when the provider profile
      // omits them from the first token exchange. ZITADEL puts standard
      // profile claims in the ID token, while the access token may only carry
      // authorization claims.
      const identity = {
        ...decodeJwt(app.accessToken),
        ...decodeJwt(app.idToken),
      };
      if (identity) {
        const given = typeof identity.given_name === 'string' ? identity.given_name : undefined;
        const family = typeof identity.family_name === 'string' ? identity.family_name : undefined;
        if (given || family) token.name = [given, family].filter(Boolean).join(' ');
        else if (typeof identity.name === 'string') token.name = identity.name;
        if (typeof identity.email === 'string') token.email = identity.email;
        else if (typeof identity.preferred_username === 'string' && identity.preferred_username.includes('@')) {
          token.email = identity.preferred_username;
        }
        if (typeof identity.picture === 'string') token.picture = identity.picture;
      }
      return app;
    },
    async session({ session, token }) {
      const app = token as typeof token & AppToken;
      session.accessToken = app.accessToken;
      session.idToken = app.idToken;
      session.userId = app.userId ?? '';
      session.roles = app.roles ?? [];
      session.permissions = app.permissions ?? [];
      session.concessionId = app.concessionId;
      session.assemblyId = app.assemblyId;
      session.assemblyIds = app.assemblyIds ?? [];
      session.scopeLevel = app.scopeLevel;
      if (typeof token.name === 'string' && token.name) session.user.name = token.name;
      if (typeof token.email === 'string' && token.email) session.user.email = token.email;
      if (typeof token.picture === 'string' && token.picture) session.user.image = token.picture;
      return session;
    },
  },
  trustHost: true,
});
