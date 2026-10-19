import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '../generated/prisma';
import { config } from './config';
import { registerAuthPlugin } from './plugins/auth';
import { registerRoutes } from './modules/ratepayers/routes';
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
      tags: [{ name: 'ratepayers' }],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  await registerAuthPlugin(app);

  const prisma = new PrismaClient();
  app.decorate('prisma', prisma);
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

  return app;
}
