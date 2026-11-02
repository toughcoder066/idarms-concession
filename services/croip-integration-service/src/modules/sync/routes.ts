import type { FastifyInstance, FastifyReply } from 'fastify';
import { requirePermissions, requireTenant } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema } from './schemas';

/**
 * sync_records carries no concession or assembly columns, so it cannot be
 * filtered to the caller's tenant. Both reads are closed until the sync
 * status is rebuilt on the CROIP sync source (docs/STATUS.md, slices 2 and 10).
 */
async function syncRecordsUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: 'not_available',
    message: 'Sync records are not tenant-scoped yet and cannot be listed',
  });
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/sync', {
    preHandler: [requirePermissions(['integration:sync']), requireTenant],
    schema: { querystring: listQuerySchema },
  }, async (_request, reply) => syncRecordsUnavailable(reply));

  app.get('/v1/sync/:id', {
    preHandler: [requirePermissions(['integration:sync']), requireTenant],
    schema: { params: byIdParamsSchema },
  }, async (_request, reply) => syncRecordsUnavailable(reply));
}
