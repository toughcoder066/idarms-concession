import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('concessions-management-service'),
  SERVICE_VERSION: z.string().default('0.1.0'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.string().min(1),
  AUTH_MODE: z.enum(['disabled', 'zitadel']).default('zitadel'),
  ZITADEL_ISSUER: z.string().optional(),
  ZITADEL_AUDIENCE: z.string().optional(),
  ZITADEL_JWKS_URI: z.string().optional(),
  ORG_CONTEXT_URL: z.string().url().optional(),
  ZITADEL_PROVISIONING_URL: z.string().url().default('http://localhost:8080'),
  ZITADEL_PROVISIONING_KEY_PATH: z.string().optional(),
  ZITADEL_PROVISIONING_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  ZITADEL_PROJECT_ID: z.string().regex(/^\d+$/, 'ZITADEL_PROJECT_ID must be the numeric ZITADEL project id').optional(),
  // The ZITADEL org that owns the iDARMS project: the iDARMS Concession org (ADR-0003).
  ZITADEL_PROJECT_OWNER_ORG_ID: z.string().regex(/^\d+$/, 'ZITADEL_PROJECT_OWNER_ORG_ID must be a numeric ZITADEL org id').optional(),
  // ZITADEL's own default org: identity infrastructure, never registered in iDARMS.
  ZITADEL_DEFAULT_ORG_ID: z.string().regex(/^\d+$/, 'ZITADEL_DEFAULT_ORG_ID must be a numeric ZITADEL org id').optional(),
  // croip-integration-service, which owns the assigned-assembly list.
  CROIP_INTEGRATION_URL: z.string().url().default('http://localhost:3090'),
  PORTAL_URL: z.string().url().default('http://localhost:3000'),
  PLATFORM_ADMIN_USER_ID: z.string().optional(),
  ACCESS_DIRECTORY_CACHE_TTL_MS: z.coerce.number().int().positive().default(15_000),
  RABBITMQ_URL: z.string().default('amqp://idarms:idarms@127.0.0.1:5672'),
  RABBITMQ_EXCHANGE: z.string().default('idarms.events'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration');
  console.error(parsed.error.message);
  throw new Error('Invalid environment configuration');
}

const env = parsed.data;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

// Header-based identity is for local work only: never in production, and in
// development only when no other machine can reach the service.
if (env.AUTH_MODE === 'disabled') {
  if (env.NODE_ENV === 'production') {
    throw new Error('AUTH_MODE=disabled is forbidden when NODE_ENV=production');
  }
  if (env.NODE_ENV === 'development' && !LOOPBACK_HOSTS.has(env.HOST)) {
    throw new Error(
      `AUTH_MODE=disabled requires a loopback HOST (127.0.0.1, localhost or ::1); got ${env.HOST}`,
    );
  }
}

// The assigned-assembly check forwards the caller's bearer token here (ADR-0003 decision 10).
if (env.NODE_ENV === 'production' && new URL(env.CROIP_INTEGRATION_URL).protocol !== 'https:') {
  throw new Error('CROIP_INTEGRATION_URL must use https when NODE_ENV=production');
}

// Invitation emails link here, so it must be the real portal over HTTPS in production.
if (env.NODE_ENV === 'production' && new URL(env.PORTAL_URL).protocol !== 'https:') {
  throw new Error('PORTAL_URL must use https when NODE_ENV=production');
}

const provisioningUrl = new URL(env.ZITADEL_PROVISIONING_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(provisioningUrl.hostname)) {
  throw new Error(
    'ZITADEL_PROVISIONING_URL must point at localhost (scope lock: local-only ZITADEL).',
  );
}

export const config = {
  nodeEnv: env.NODE_ENV,
  serviceName: env.SERVICE_NAME,
  serviceVersion: env.SERVICE_VERSION,
  host: env.HOST,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  authMode: env.AUTH_MODE,
  zitadelIssuer: env.ZITADEL_ISSUER,
  zitadelAudience: env.ZITADEL_AUDIENCE,
  zitadelJwksUri: env.ZITADEL_JWKS_URI,
  orgContextUrl: env.ORG_CONTEXT_URL ?? 'http://localhost:3100',
  zitadelProvisioningUrl: env.ZITADEL_PROVISIONING_URL,
  zitadelProvisioningKeyPath: env.ZITADEL_PROVISIONING_KEY_PATH,
  zitadelProvisioningTimeoutMs: env.ZITADEL_PROVISIONING_TIMEOUT_MS,
  zitadelProjectId: env.ZITADEL_PROJECT_ID,
  zitadelProjectOwnerOrgId: env.ZITADEL_PROJECT_OWNER_ORG_ID,
  zitadelDefaultOrgId: env.ZITADEL_DEFAULT_ORG_ID,
  croipIntegrationUrl: env.CROIP_INTEGRATION_URL,
  portalUrl: env.PORTAL_URL,
  platformAdminUserId: env.PLATFORM_ADMIN_USER_ID,
  accessDirectoryCacheTtlMs: env.ACCESS_DIRECTORY_CACHE_TTL_MS,
  rabbitmqUrl: env.RABBITMQ_URL,
  rabbitmqExchange: env.RABBITMQ_EXCHANGE,
  corsOrigins: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  logLevel: env.LOG_LEVEL,
  permissions: [
    'assembly:read',
    'assembly:manage',
    'concession:read',
    'concession:manage',
    'staff:read',
    'staff:manage',
    'fee_fixing:read',
    'fee_fixing:manage',
    'fee_fixing:publish',
    'approval:read',
    'approval:manage',
    'target:read',
    'target:manage',
    'audit:read',
    'agent:manage',
    'gis:read',
    'gis:manage',
    'reporting:read',
    'ratepayer:read',
    'property:read',
    'document:read',
    'valuation:read',
    'bill:read',
    'payment:read',
    'reconciliation:read',
  ] as string[],
  publishedEvents: ["fee_fixing.published.v1"] as string[],
  consumedRoutingKeys: [] as string[],
};
