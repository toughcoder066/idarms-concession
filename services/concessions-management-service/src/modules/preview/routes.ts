import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAny } from '../../plugins/auth';
import {
  PreviewAuditError,
  recordPreviewEntry,
} from './service';

const previewAuditSchema = z.object({
  persona: z.string().trim().min(1).max(80),
});

function parseOrReply<T>(
  schema: z.ZodType<T>,
  value: unknown,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    reply.code(400).send({
      error: 'bad_request',
      message: 'Invalid request',
      issues: parsed.error.issues,
    });
    return null;
  }
  return parsed.data;
}

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof PreviewAuditError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  request.log.error({ err: error }, 'preview audit failed');
  return reply.code(500).send({
    error: 'preview_audit_failed',
    message: 'Preview audit could not be recorded.',
  });
}

export async function registerPreviewRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/preview/audit', {
    preHandler: requireAny(['portfolio:audit:read'], ['CONCESSION_SUPER_ADMIN', 'PLATFORM_ADMIN']),
  }, async (request, reply) => {
    const body = parseOrReply(previewAuditSchema, request.body ?? {}, reply);
    if (!body) return;

    const actorRole = request.auth.roles.includes('CONCESSION_SUPER_ADMIN')
      ? 'CONCESSION_SUPER_ADMIN'
      : 'PLATFORM_ADMIN';
    try {
      const data = await recordPreviewEntry(app.prisma, {
        actorId: request.auth.subject,
        actorRole,
        actorName: request.auth.name,
        actorEmail: request.auth.email,
        concessionId: request.auth.concessionId,
        requestId: request.id,
      }, body.persona);
      return reply.code(201).send({ data });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
