import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readScopeFromAuth, readScopeWhere } from '../../lib/tenancy';
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

function tenantUnresolved(reply: FastifyReply) {
  return reply.code(403).send({
    error: 'tenant_unresolved',
    message: 'Concession and assembly context could not be resolved',
  });
}

/**
 * Reads: one assembly for assembly staff, every assembly of the concession for
 * the concession super admin only (ADR-0002).
 */
function readScope(request: FastifyRequest) {
  const scope = readScopeFromAuth(request.auth);
  return scope ? readScopeWhere(scope) : null;
}

/** Writes always happen inside the caller's own assembly, taken from the token. */
function writeScope(request: FastifyRequest) {
  const { concessionId, assemblyId } = request.auth;
  return concessionId && assemblyId ? { concessionId, assemblyId } : null;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/zones', {
    preHandler: requirePermissions(['gis:read']),
    schema: { querystring: listQuerySchema },
  }, async (request, reply) => {
    const scope = readScope(request);
    if (!scope) return tenantUnresolved(reply);
    const rows = await service.list(app.prisma, scope);
    return { data: rows };
  });

  app.get('/v1/zones/:id', {
    preHandler: requirePermissions(['gis:read']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const scope = readScope(request);
    if (!scope) return tenantUnresolved(reply);
    const row = await service.getById(app.prisma, id, scope);
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
    return row;
  });

  app.get('/v1/zones/:id/blocks', {
    preHandler: requirePermissions(['gis:read']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const scope = readScope(request);
    if (!scope) return tenantUnresolved(reply);
    return { data: await service.listBlocks(app.prisma, id, scope) };
  });

  app.post('/v1/zones', {
    preHandler: requirePermissions(['gis:manage']),
  }, async (request, reply) => {
    const scope = writeScope(request);
    if (!scope) return tenantUnresolved(reply);
    const input = parse(zoneCreateSchema, request.body, reply);
    if (!input) return;
    if (input.assemblyId && input.assemblyId !== scope.assemblyId) {
      return reply.code(403).send({ error: 'forbidden', message: 'You cannot create zones outside your assigned assembly.' });
    }
    const row = await service.createZone(app.prisma, scope, input);
    return reply.code(201).send(row);
  });

  app.post('/v1/zones/:id/blocks', {
    preHandler: requirePermissions(['gis:manage']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const scope = writeScope(request);
    if (!scope) return tenantUnresolved(reply);
    const input = parse(blockCreateSchema, request.body, reply);
    if (!input) return;
    if (input.boundaryCoordinates === undefined) {
      return reply.code(400).send({ error: 'bad_request', message: 'boundaryCoordinates is required' });
    }
    const row = await service.createBlock(app.prisma, id, scope, input);
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'Zone not found' });
    return reply.code(201).send(row);
  });
}
