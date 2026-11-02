import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('payment-service'),
  SERVICE_VERSION: z.string().default('0.1.0'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3040),
  DATABASE_URL: z.string().min(1),
  AUTH_MODE: z.enum(['disabled', 'zitadel']).default('disabled'),
  ZITADEL_ISSUER: z.string().optional(),
  ZITADEL_AUDIENCE: z.string().optional(),
  ZITADEL_JWKS_URI: z.string().optional(),
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

if (env.NODE_ENV === 'production' && env.AUTH_MODE === 'disabled') {
  throw new Error('AUTH_MODE=disabled is forbidden when NODE_ENV=production');
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
