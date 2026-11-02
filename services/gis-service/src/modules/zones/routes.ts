import type { FastifyInstance, FastifyReply } from 'fastify';
import { requirePermissions } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema } from './schemas';
import { blockCreateSchema, zoneCreateSchema } from './writes.schemas';
import * as service from './service';

function parse<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown } } },
  body: unknown,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'bad_request', message: 'Invalid request body', issues: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/zones', {
    preHandler: requirePermissions(['gis:read']),
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const { concessionId, assemblyId, scopeLevel } = request.auth;
    const rows = await service.list(app.prisma, {
      concessionId,
      assemblyId: scopeLevel === 'PORTFOLIO' ? undefined : assemblyId,
    });
    return { data: rows };
  });

  app.get('/v1/zones/:id', {
    preHandler: requirePermissions(['gis:read']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { concessionId, assemblyId, scopeLevel } = request.auth;
    const row = await service.getById(app.prisma, id, {
      concessionId,
      assemblyId: scopeLevel === 'PORTFOLIO' ? undefined : assemblyId,
    });
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
    return row;
  });

  app.get('/v1/zones/:id/blocks', {
    preHandler: requirePermissions(['gis:read']),
    schema: { params: byIdParamsSchema },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { concessionId, assemblyId, scopeLevel } = request.auth;
    return {
      data: await service.listBlocks(app.prisma, id, {
        concessionId,
        assemblyId: scopeLevel === 'PORTFOLIO' ? undefined : assemblyId,
      }),
    };
  });

  app.post('/v1/zones', {
    preHandler: requirePermissions(['gis:manage']),
  }, async (request, reply) => {
    const { concessionId, assemblyId, scopeLevel } = request.auth;
    if (!concessionId) {
      return reply.code(400).send({ error: 'missing_context', message: 'Concession context is required.' });
    }
    const input = parse(zoneCreateSchema, request.body, reply);
    if (!input) return;
    const targetAssemblyId = scopeLevel === 'PORTFOLIO' ? input.assemblyId : (assemblyId ?? input.assemblyId);
    if (!targetAssemblyId) {
      return reply.code(400).send({ error: 'missing_context', message: 'Assembly context is required.' });
    }
    if (scopeLevel !== 'PORTFOLIO' && assemblyId && input.assemblyId && input.assemblyId !== assemblyId) {
      return reply.code(403).send({ error: 'forbidden', message: 'You cannot create zones outside your assigned assembly.' });
    }
    const row = await service.createZone(app.prisma, { concessionId, assemblyId: targetAssemblyId }, input);
    return reply.code(201).send(row);
  });

  app.post('/v1/zones/:id/blocks', {
    preHandler: requirePermissions(['gis:manage']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { concessionId, assemblyId, scopeLevel } = request.auth;
    if (!concessionId) {
      return reply.code(400).send({ error: 'missing_context', message: 'Concession context is required.' });
    }
    const input = parse(blockCreateSchema, request.body, reply);
    if (!input) return;
    if (input.boundaryCoordinates === undefined) {
      return reply.code(400).send({ error: 'bad_request', message: 'boundaryCoordinates is required' });
    }
    const row = await service.createBlock(app.prisma, id, {
      concessionId,
      assemblyId: scopeLevel === 'PORTFOLIO' ? undefined : assemblyId,
    }, input);
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'Zone not found' });
    return reply.code(201).send(row);
  });
}
