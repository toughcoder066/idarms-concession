import { decodeJwt } from 'jose';
import { config } from '../config';
import type { EventEnvelope } from './events';

export interface CloudEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  time: string;
  subject: string;
  datacontenttype: 'application/json';
  data: Record<string, unknown>;
}

export interface IngestionReceipt {
  ingestionId: string;
  status: string;
  eventId: string;
  receivedAt: string;
  statusUrl: string;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

function permissionValues(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/[ ,]+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (value && typeof value === 'object') return Object.keys(value);
  return [];
}

function eventPermissions(claims: Record<string, unknown>): Set<string> {
  return new Set([
    ...permissionValues(claims.scope),
    ...permissionValues(claims['urn:zitadel:iam:org:project:roles']),
    ...permissionValues(claims['urn:idarms:service-roles']),
  ]);
}

function oauthScope(): string {
  if (!config.croipOauthScope) {
    throw new Error('Set CROIP_OAUTH_SCOPE or CROIP_ZITADEL_PROJECT_ID to request CROIP permissions');
  }
  return config.croipOauthScope;
}

async function getMachineToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const { croipZitadelIssuer, croipClientId, croipClientSecret } = config;
  if (!croipZitadelIssuer || !croipClientId || !croipClientSecret) {
    throw new Error('CROIP_ZITADEL_ISSUER, CROIP_CLIENT_ID and CROIP_CLIENT_SECRET are required for event delivery');
  }

  const timeout = AbortSignal.timeout(config.croipRequestTimeoutMs);
  const discoveryResponse = await fetch(`${croipZitadelIssuer}/.well-known/openid-configuration`, { signal: timeout });
  if (!discoveryResponse.ok) {
    throw new Error(`CROIP ZITADEL discovery failed with HTTP ${discoveryResponse.status}`);
  }

  const discovery = await discoveryResponse.json() as { token_endpoint?: string };
  if (!discovery.token_endpoint) {
    throw new Error('CROIP ZITADEL discovery response did not include token_endpoint');
  }

  const credentials = Buffer.from(`${croipClientId}:${croipClientSecret}`).toString('base64');
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: oauthScope() }),
    signal: AbortSignal.timeout(config.croipRequestTimeoutMs),
  });
  if (!tokenResponse.ok) {
    throw new Error(`CROIP ZITADEL token request failed with HTTP ${tokenResponse.status}`);
  }

  const tokenBody = await tokenResponse.json() as { access_token?: string; expires_in?: number };
  if (!tokenBody.access_token) {
    throw new Error('CROIP ZITADEL token response did not include an access_token');
  }

  const claims = decodeJwt(tokenBody.access_token);
  if (!eventPermissions(claims).has('gateway:ingest')) {
    throw new Error('The CROIP machine token is missing the required gateway:ingest permission');
  }

  cachedToken = {
    value: tokenBody.access_token,
    expiresAt: Date.now() + (tokenBody.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

export function toCloudEvent(event: EventEnvelope): CloudEvent {
  return {
    specversion: '1.0',
    id: event.id,
    source: `urn:idarms:${event.producer}`,
    type: event.eventType.startsWith('croip.') ? event.eventType.slice('croip.'.length) : event.eventType,
    time: event.occurredAt,
    subject: `${event.aggregateType}/${event.aggregateId}`,
    datacontenttype: 'application/json',
    data: {
      eventVersion: event.eventVersion,
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      correlationId: event.correlationId,
      causationId: event.causationId ?? null,
      payload: event.payload,
    },
  };
}

export async function submitCloudEvent(event: EventEnvelope): Promise<IngestionReceipt> {
  const token = await getMachineToken();
  const response = await fetch(`${config.croipReportingGatewayUrl}/v1/events`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(toCloudEvent(event)),
    signal: AbortSignal.timeout(config.croipRequestTimeoutMs),
  });

  const body: unknown = await response.json().catch(() => undefined);
  if (response.status !== 202) {
    const details = body && typeof body === 'object' && 'title' in body
      ? String(body.title)
      : `HTTP ${response.status}`;
    throw new Error(`CROIP event ingestion rejected: ${details}`);
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('ingestionId' in body) ||
    typeof body.ingestionId !== 'string' ||
    !('eventId' in body) ||
    body.eventId !== event.id ||
    !('status' in body) ||
    typeof body.status !== 'string' ||
    !('receivedAt' in body) ||
    typeof body.receivedAt !== 'string' ||
    !('statusUrl' in body) ||
    typeof body.statusUrl !== 'string'
  ) {
    throw new Error('CROIP returned HTTP 202 with an invalid ingestion receipt');
  }

  return body as IngestionReceipt;
}
