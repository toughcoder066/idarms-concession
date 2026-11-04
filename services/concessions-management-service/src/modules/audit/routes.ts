import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { requireAny } from '../../plugins/auth';
import { getAccessibleAssemblies } from '../access-directory/service';
import { concessionOrgId } from '../orgs/context';
import { resolveStaffAccess, StaffAccessError } from '../staff/access';
import { writeDeniedRequestAudit } from './security';
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_MAX_PAGE_SIZE,
  AuditQueryError,
  listAssemblyAudit,
  listAssemblyAuditActors,
  listConcessionAudit,
  type AuditDeps,
  type AuditFilters,
} from './service';

const assemblyParamsSchema = z.object({
  assemblyId: z.string().uuid(),
});

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(AUDIT_MAX_PAGE_SIZE).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  action: z.string().trim().max(120).optional(),
  actionPrefix: z.string().trim().max(120).optional(),
  actorId: z.string().trim().max(120).optional(),
  assemblyId: z.string().uuid().optional(),
});

type AuditQuery = z.infer<typeof auditQuerySchema>;

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

function parseBoundary(value: string | undefined, endOfDay: boolean): Date | undefined | null {
  if (!value) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly && endOfDay ? `${value}T23:59:59.999Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function filtersOrReply(query: AuditQuery, reply: FastifyReply): AuditFilters | null {
  const from = parseBoundary(query.from, false);
  const to = parseBoundary(query.to, true);
  if (from === null || to === null) {
    reply.code(400).send({
      error: 'bad_request',
      message: 'from and to must be ISO dates or date-times.',
    });
    return null;
  }
  if (from && to && from > to) {
    reply.code(400).send({
      error: 'bad_request',
      message: 'from must be before or equal to to.',
    });
    return null;
  }
  const actionValue = query.action || undefined;
  const actionPrefix = query.actionPrefix
    || (actionValue?.endsWith('*') ? actionValue.slice(0, -1) : undefined);
  const action = actionValue && !actionValue.endsWith('*') ? actionValue : undefined;
  return {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? AUDIT_DEFAULT_PAGE_SIZE,
    from,
    to,
    action,
    actionPrefix,
    actorId: query.actorId || undefined,
    assemblyId: query.assemblyId,
  };
}

async function sendError(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): Promise<FastifyReply> {
  if (error instanceof StaffAccessError || error instanceof AuditQueryError) {
    await writeDeniedRequestAudit(app.prisma, request, error);
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  request.log.error({ err: error }, 'audit query failed');
  return reply.code(500).send({
    error: 'audit_query_failed',
    message: 'Audit query failed.',
  });
}

/** The caller's concession org comes from the org registry; concession-wide users live there. */
async function concessionOrgOf(app: FastifyInstance, concessionId: string | undefined): Promise<string | undefined> {
  return concessionId ? (await concessionOrgId(app.prisma, concessionId)) ?? undefined : undefined;
}

async function auditDeps(
  app: FastifyInstance,
  concessionId: string | undefined,
  assembly: {
    id: string;
    assemblyName: string;
    assemblyCode: string;
    orgId: string;
  },
): Promise<AuditDeps> {
  return {
    prisma: app.prisma,
    zitadel: app.zitadelProvisioning,
    concessionOrgId: await concessionOrgOf(app, concessionId),
    assemblyOrgId: assembly.orgId,
    assemblyId: assembly.id,
    assemblyName: assembly.assemblyName,
    assemblyCode: assembly.assemblyCode,
  };
}

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/assemblies/:assemblyId/audit', async (request, reply) => {
    const params = parseOrReply(assemblyParamsSchema, request.params, reply);
    if (!params) return;
    const query = parseOrReply(auditQuerySchema, request.query ?? {}, reply);
    if (!query) return;
    const filters = filtersOrReply(query, reply);
    if (!filters) return;

    try {
      const access = await resolveStaffAccess(app.prisma, request.auth, params.assemblyId);
      const data = await listAssemblyAudit(
        await auditDeps(app, request.auth.concessionId, {
          id: access.assembly.id,
          assemblyName: access.assembly.assemblyName,
          assemblyCode: access.assembly.assemblyCode,
          orgId: access.orgId,
        }) as AuditDeps & { assemblyId: string; assemblyOrgId: string },
        filters,
      );
      return { data };
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.get('/v1/assemblies/:assemblyId/audit/actors', async (request, reply) => {
    const params = parseOrReply(assemblyParamsSchema, request.params, reply);
    if (!params) return;
    const query = parseOrReply(auditQuerySchema, request.query ?? {}, reply);
    if (!query) return;
    const filters = filtersOrReply(query, reply);
    if (!filters) return;

    try {
      const access = await resolveStaffAccess(app.prisma, request.auth, params.assemblyId);
      const data = await listAssemblyAuditActors(
        await auditDeps(app, request.auth.concessionId, {
          id: access.assembly.id,
          assemblyName: access.assembly.assemblyName,
          assemblyCode: access.assembly.assemblyCode,
          orgId: access.orgId,
        }) as AuditDeps & { assemblyId: string; assemblyOrgId: string },
        filters,
      );
      return { data };
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.get('/v1/concession/audit', {
    preHandler: requireAny(['concession:audit:read'], ['CONCESSION_SUPER_ADMIN']),
  }, async (request, reply) => {
    const query = parseOrReply(auditQuerySchema, request.query ?? {}, reply);
    if (!query) return;
    const filters = filtersOrReply(query, reply);
    if (!filters) return;
    if (!config.zitadelProjectId) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for the concession audit ledger.',
      });
    }

    try {
      const accessibleAssemblies = await getAccessibleAssemblies(app.prisma, app.zitadelProvisioning, {
        userId: request.auth.subject,
        projectId: config.zitadelProjectId,
        concessionId: request.auth.concessionId,
        ttlMs: config.accessDirectoryCacheTtlMs,
      });
      const data = await listConcessionAudit({
        prisma: app.prisma,
        zitadel: app.zitadelProvisioning,
        concessionOrgId: await concessionOrgOf(app, request.auth.concessionId),
        actorId: request.auth.subject,
        accessibleAssemblies,
      }, filters);
      return {
        data,
        cacheTtlMs: config.accessDirectoryCacheTtlMs,
      };
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });
}
