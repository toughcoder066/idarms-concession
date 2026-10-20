import NextAuth from 'next-auth';
import Zitadel from 'next-auth/providers/zitadel';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    idToken?: string;
  }
}

interface AppToken {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
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
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        const app = token as typeof token & AppToken;
        app.accessToken = account.access_token;
        app.idToken = account.id_token;
        app.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      const app = token as typeof token & AppToken;
      session.accessToken = app.accessToken;
      session.idToken = app.idToken;
      return session;
    },
  },
  trustHost: true,
});
