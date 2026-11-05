import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('payment-service'),
  SERVICE_VERSION: z.string().default('0.1.0'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3040),
  DATABASE_URL: z.string().min(1),
  AUTH_MODE: z.enum(['disabled', 'zitadel']).default('zitadel'),
  ZITADEL_ISSUER: z.string().optional(),
  ZITADEL_AUDIENCE: z.string().optional(),
  ZITADEL_JWKS_URI: z.string().optional(),
  ZITADEL_PROJECT_ID: z.string().regex(/^\d+$/, 'ZITADEL_PROJECT_ID must be the numeric ZITADEL project id').optional(),
  ORG_CONTEXT_URL: z.string().url().optional(),
  RABBITMQ_URL: z.string().default('amqp://idarms:idarms@127.0.0.1:5672'),
  RABBITMQ_EXCHANGE: z.string().default('idarms.events'),
  GATEWAY_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_PATHS: z.string().default('/v1/payments/webhook'),
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

// Tenant context is fetched with the caller's bearer token, so in production it must
// travel over TLS to a configured registry (ADR-0003).
if (env.NODE_ENV === 'production' && !env.ORG_CONTEXT_URL?.startsWith('https://')) {
  throw new Error('ORG_CONTEXT_URL must be set to an https:// URL when NODE_ENV=production');
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
  zitadelProjectId: env.ZITADEL_PROJECT_ID,
  orgContextUrl: env.ORG_CONTEXT_URL ?? 'http://localhost:3100',
  rabbitmqUrl: env.RABBITMQ_URL,
  rabbitmqExchange: env.RABBITMQ_EXCHANGE,
  gatewayWebhookSecret: env.GATEWAY_WEBHOOK_SECRET,
  publicPaths: env.PUBLIC_PATHS.split(',').map((path) => path.trim()).filter(Boolean),
  corsOrigins: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  logLevel: env.LOG_LEVEL,
  permissions: ["payment:read","payment:checkout"] as string[],
  publishedEvents: ["payment.collected.v1"] as string[],
  consumedRoutingKeys: ["bill.issued.v1"] as string[],
};
