import type { FastifyInstance } from 'fastify';
import { requirePermissions, requireReadScope, readScopeOf, requireTenant, tenantOf } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema } from './schemas';
import * as service from './service';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/bills', {
    preHandler: [requirePermissions(['bill:read']), requireReadScope],
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const rows = await service.list(app.prisma, readScopeOf(request));
    return { data: rows };
  });

  app.get('/v1/bills/:id', {
    preHandler: [requirePermissions(['bill:read']), requireReadScope],
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await service.getById(app.prisma, id, readScopeOf(request));
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
    return row;
  });
}
