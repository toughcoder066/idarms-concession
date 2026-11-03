import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '../generated/prisma';
import { config } from './config';
import { registerAuthPlugin } from './plugins/auth';
import { registerRoutes } from './modules/concessions/routes';
import { registerStaffRoutes } from './modules/staff/routes';
import { registerAuditRoutes } from './modules/audit/routes';
import { registerPreviewRoutes } from './modules/preview/routes';
import { wasDenialAudited, writeDeniedRequestAudit } from './modules/audit/security';
import { createZitadelProvisioningClient } from './modules/provisioning/zitadel-client';
import './types/global';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
  });

  await app.register(cors, { origin: config.corsOrigins });

  await app.register(swagger, {
    openapi: {
      info: {
        title: `${config.serviceName} API`,
        version: config.serviceVersion,
      },
      tags: [{ name: 'concessions' }],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  await registerAuthPlugin(app);

  const prisma = new PrismaClient();
  app.decorate('prisma', prisma);
  app.decorate('zitadelProvisioning', createZitadelProvisioningClient({
    baseUrl: config.zitadelProvisioningUrl,
    keyPath: config.zitadelProvisioningKeyPath,
    timeoutMs: config.zitadelProvisioningTimeoutMs,
    portalUrl: config.portalUrl,
  }));
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  app.get('/health/live', async () => ({ status: 'ok', service: config.serviceName }));
  app.get('/health/ready', async () => ({ status: 'ok', database: 'ok' }));
  app.get('/metrics', async () => ({
    service: config.serviceName,
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
  }));

  await app.register(registerRoutes);
  await app.register(registerStaffRoutes);
  await app.register(registerAuditRoutes);
  await app.register(registerPreviewRoutes);

  // Fallback for pre-existing assembly read endpoints that return a 404 when
  // the caller is outside the assembly scope. Provisioning/audit routes record
  // richer entries themselves and mark the request to avoid duplicates.
  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode !== 403 && reply.statusCode !== 404) return;
    if (wasDenialAudited(request)) return;
    if (!request.auth.subject || request.auth.subject === 'unauthenticated') return;
    const match = request.url.match(/^\/v1\/assemblies\/([0-9a-fA-F-]{36})(?:\/|$)/);
    if (!match) return;
    await writeDeniedRequestAudit(app.prisma, request, {
      code: reply.statusCode === 403 ? 'forbidden' : 'not_found',
      statusCode: reply.statusCode,
      message: 'Request denied.',
      auditContext: { assemblyId: match[1] },
    });
  });

  return app;
}
