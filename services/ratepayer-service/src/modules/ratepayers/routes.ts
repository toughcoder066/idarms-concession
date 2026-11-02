import type { FastifyInstance } from 'fastify';
import { requirePermissions, requireTenant, tenantOf } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema } from './schemas';
import * as service from './service';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/ratepayers', {
    preHandler: [requirePermissions(['ratepayer:read']), requireTenant],
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const rows = await service.list(app.prisma, tenantOf(request));
    return { data: rows };
  });

  app.get('/v1/ratepayers/:id', {
    preHandler: [requirePermissions(['ratepayer:read']), requireTenant],
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await service.getById(app.prisma, id, tenantOf(request));
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
    return row;
  });
}
