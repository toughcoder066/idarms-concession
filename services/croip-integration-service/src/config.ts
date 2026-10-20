import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('croip-integration-service'),
  SERVICE_VERSION: z.string().default('0.1.0'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3090),
  DATABASE_URL: z.string().min(1),
  AUTH_MODE: z.enum(['disabled', 'zitadel']).default('disabled'),
  ZITADEL_ISSUER: z.string().optional(),
  ZITADEL_AUDIENCE: z.string().optional(),
  ZITADEL_JWKS_URI: z.string().optional(),
  RABBITMQ_URL: z.string().default('amqp://idarms:idarms@127.0.0.1:5672'),
  RABBITMQ_EXCHANGE: z.string().default('idarms.events'),
  CROIP_EXCHANGE: z.string().default('croip.events'),
  CONCESSION_ID: z.string().uuid().default('11111111-1111-1111-1111-111111111111'),
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
  rabbitmqUrl: env.RABBITMQ_URL,
  rabbitmqExchange: env.RABBITMQ_EXCHANGE,
  croipExchange: env.CROIP_EXCHANGE,
  concessionId: env.CONCESSION_ID,
  corsOrigins: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  logLevel: env.LOG_LEVEL,
  permissions: ["integration:sync"] as string[],
  publishedEvents: [] as string[],
  // Local operational events the bridge relays up to CROIP for oversight.
  // Master data (ratepayers, properties) is the exception: those are written
  // directly to CROIP's registries from the portal, so they never flow upstream.
  consumedRoutingKeys: ["property.verified.v1","property.valuation_completed.v1","bill.issued.v1","payment.collected.v1","reconciliation.discrepancy_detected.v1","document.uploaded.v1"] as string[],
  // National events the bridge relays down to iDARMS.
  croipConsumedRoutingKeys: ["croip.ratepayer.registered.v1","croip.property.registered.v1"] as string[],
};
