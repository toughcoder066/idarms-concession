import type { FastifyInstance } from 'fastify';
import { requirePermissions, requireReadScope, readScopeOf, requireTenant, tenantOf } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema, verifyBodySchema } from './schemas';
import * as service from './service';
import type { VerifyInput } from './service';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/properties', {
    preHandler: [requirePermissions(['property:read']), requireReadScope],
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const rows = await service.list(app.prisma, readScopeOf(request));
    return { data: rows };
  });

  app.get('/v1/properties/:id', {
    preHandler: [requirePermissions(['property:read']), requireReadScope],
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await service.getById(app.prisma, id, readScopeOf(request));
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
    return row;
  });

  app.post('/v1/properties/:id/verify', {
    preHandler: [requirePermissions(['property:verify']), requireTenant],
    schema: { params: byIdParamsSchema, body: verifyBodySchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { concessionId, assemblyId } = tenantOf(request);
    const { subject } = request.auth;

    const result = await service.verify(app.prisma, request.body as VerifyInput, {
      propertyId: id,
      agentId: subject,
      concessionId,
      assemblyId,
      correlationId: request.id,
    });

    if (!result) {
      return reply.code(404).send({ error: 'not_found', message: 'Property not found' });
    }
    return reply.code(201).send(result);
  });
}
