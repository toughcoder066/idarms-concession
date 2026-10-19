import type { FastifyInstance } from 'fastify';
import { requirePermissions } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema } from './schemas';
import * as service from './service';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('__ROUTE_PREFIX__', {
    preHandler: requirePermissions(['__READ_PERMISSION__']),
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const { concessionId, assemblyId } = request.auth;
    const rows = await service.list(app.prisma, { concessionId, assemblyId });
    return { data: rows };
  });

  app.get('__ROUTE_PREFIX__/:id', {
    preHandler: requirePermissions(['__READ_PERMISSION__']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { concessionId, assemblyId } = request.auth;
    const row = await service.getById(app.prisma, id, { concessionId, assemblyId });
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
    return row;
  });
}
