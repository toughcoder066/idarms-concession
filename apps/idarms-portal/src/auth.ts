import NextAuth from 'next-auth';
import Zitadel from 'next-auth/providers/zitadel';
import { NextResponse } from 'next/server';
import {
  claimsFromAccessToken,
  decodeJwt,
  endedToken,
  refreshAccessToken,
  rolesFromAccessToken,
  sessionEndPath,
  type AppToken,
  type SessionError,
} from './lib/session-token';
import { revokeRefreshToken } from './lib/zitadel-login/revoke';

// The session carries no tokens: access, ID and refresh tokens stay in the
// encrypted session cookie and are read only on the server (lib/server-token.ts).
declare module 'next-auth' {
  interface Session {
    error?: SessionError;
    userId?: string;
    roles: string[];
    permissions: string[];
    scopeLevel?: string;
    assemblyIds: string[];
    concessionId?: string;
    assemblyId?: string;
  }
}

if (!process.env.ZITADEL_PROJECT_ID) {
  console.warn('[auth] ZITADEL_PROJECT_ID is not set; only the generic project role claim is read.');
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Zitadel({
      issuer: process.env.ZITADEL_ISSUER,
      clientId: process.env.ZITADEL_CLIENT_ID,
      clientSecret: process.env.ZITADEL_CLIENT_SECRET,
      authorization: {
        // resourceowner puts the user's home organisation into the tokens.
        params: { scope: 'openid profile email offline_access urn:zitadel:iam:user:resourceowner' },
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    /** A user with no iDARMS role in their home organisation never gets a session. */
    async signIn({ account }) {
      const { userId, roles } = rolesFromAccessToken(account?.access_token);
      if (roles.length > 0) return true;
      console.warn('[auth] Sign-in refused: the user holds no iDARMS role in their home organisation.', { subject: userId });
      if (account?.refresh_token) await revokeRefreshToken(account.refresh_token);
      return sessionEndPath('NoRoles');
    },
    /** An ended session goes to the sign-out route, which clears it; no session goes to /login. */
    authorized({ auth, request }) {
      if (auth?.error) return NextResponse.redirect(new URL(sessionEndPath(auth.error), request.nextUrl));
      return Boolean(auth?.user);
    },
    async jwt({ token, account }) {
      const app = token as typeof token & AppToken;
      if (account) {
        app.accessToken = account.access_token;
        app.idToken = account.id_token;
        app.refreshToken = account.refresh_token;
        app.expiresAt = account.expires_at;
        delete app.error;
      }
      if (app.error) return { sub: token.sub, ...endedToken(app, app.error) };

      Object.assign(app, await refreshAccessToken(app));
      if (app.error) return { sub: token.sub, ...endedToken(app, app.error) };

      // Roles are re-read from every new access token, so a revoked role ends
      // the session at the next refresh at the latest.
      const claims = await claimsFromAccessToken(app.accessToken);
      if (claims.roles.length === 0) {
        console.warn('[auth] Session ended: the user no longer holds an iDARMS role.', { subject: claims.userId });
        return { sub: token.sub, ...endedToken(app, 'NoRoles') };
      }
      app.userId = claims.userId;
      app.roles = claims.roles;
      app.permissions = claims.permissions;
      app.concessionId = claims.concessionId;
      app.assemblyId = claims.assemblyId;
      app.assemblyIds = claims.assemblyIds;
      app.scopeLevel = claims.scopeLevel;

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
      session.error = app.error;
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
