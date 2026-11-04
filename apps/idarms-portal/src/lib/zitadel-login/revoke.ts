// No Node-only imports: auth.ts uses this, and auth.ts also runs in the edge middleware.

/** Revokes the refresh token at ZITADEL. Best effort; sign-out still completes. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const issuer = process.env.ZITADEL_ISSUER?.replace(/\/+$/, '');
  const clientId = process.env.ZITADEL_CLIENT_ID;
  const clientSecret = process.env.ZITADEL_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return;
  try {
    await fetch(`${issuer}/oauth/v2/revoke`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`)}`,
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
