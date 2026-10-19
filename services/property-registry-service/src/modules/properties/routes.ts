import type { FastifyInstance } from 'fastify';
import { requirePermissions } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema, verifyBodySchema } from './schemas';
import * as service from './service';
import type { VerifyInput } from './service';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/properties', {
    preHandler: requirePermissions(['property:read']),
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const { concessionId, assemblyId } = request.auth;
    const rows = await service.list(app.prisma, { concessionId, assemblyId });
    return { data: rows };
  });

  app.get('/v1/properties/:id', {
    preHandler: requirePermissions(['property:read']),
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

  app.post('/v1/properties/:id/verify', {
    preHandler: requirePermissions(['property:verify']),
    schema: { params: byIdParamsSchema, body: verifyBodySchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { concessionId, assemblyId, subject } = request.auth;
    if (!concessionId || !assemblyId) {
      return reply.code(400).send({ error: 'bad_request', message: 'Missing concession/assembly context' });
    }

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
