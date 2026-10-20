// OAuth2 client-credentials (M2M) token acquisition.
//
// Upward communication to CROIP is authenticated by CROIP's own ZITADEL: CROIP
// issues iDARMS a machine client (ID + secret) that is used here to request a
// bearer token carrying the `concession:data-producer` role.
//
// Server-only: these credentials must never be bundled into client code.

let cached: { token: string; expiresAt: number } | null = null;

export async function getMachineToken(): Promise<string | null> {
  const issuer = process.env.CROIP_ZITADEL_ISSUER;
  const clientId = process.env.CROIP_CLIENT_ID;
  const clientSecret = process.env.CROIP_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) {
    return null;
  }

  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const discovery = (await fetch(`${issuer}/.well-known/openid-configuration`).then((res) =>
    res.json(),
  )) as { token_endpoint: string };

  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid',
    }),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}
