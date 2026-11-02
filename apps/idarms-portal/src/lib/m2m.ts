import 'server-only';

import { appConfig } from './config';

let cached: { token: string; expiresAt: number } | null = null;

function getScope(): string {
  const explicitScope = process.env.CROIP_OAUTH_SCOPE;
  if (explicitScope) return explicitScope;
  const projectId = process.env.CROIP_ZITADEL_PROJECT_ID;
  if (!projectId) {
    throw new Error('Set CROIP_OAUTH_SCOPE or CROIP_ZITADEL_PROJECT_ID to request CROIP permissions');
  }
  return `openid urn:zitadel:iam:org:project:id:${projectId}:roles urn:zitadel:iam:org:project:id:${projectId}:aud`;
}

export async function getMachineToken(): Promise<string> {
  const issuer = process.env.CROIP_ZITADEL_ISSUER;
  const clientId = process.env.CROIP_CLIENT_ID;
  const clientSecret = process.env.CROIP_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) {
    throw new Error('CROIP_ZITADEL_ISSUER, CROIP_CLIENT_ID and CROIP_CLIENT_SECRET must be configured');
  }

  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const discoveryResponse = await fetch(
    `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
    { signal: AbortSignal.timeout(appConfig.croipRequestTimeoutMs) },
  );
  if (!discoveryResponse.ok) {
    throw new Error(`CROIP ZITADEL discovery failed with HTTP ${discoveryResponse.status}`);
  }

  const discovery = await discoveryResponse.json() as { token_endpoint?: string };
  if (!discovery.token_endpoint) {
    throw new Error('CROIP ZITADEL discovery response did not include token_endpoint');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: getScope(),
    }),
    signal: AbortSignal.timeout(appConfig.croipRequestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`CROIP ZITADEL token request failed with HTTP ${response.status}`);
  }

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('CROIP ZITADEL token response did not include an access_token');
  }

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}
