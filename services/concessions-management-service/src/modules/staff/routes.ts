import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { writeAudit } from '../concessions/audit';
import { markDenialAudited, writeDeniedRequestAudit } from '../audit/security';
import {
  resolveStaffAccess,
  StaffAccessError,
  StaffDomainError,
  type StaffAccessContext,
} from './access';
import {
  deactivateStaff,
  editStaffRole,
  inviteStaff,
  listStaff,
  listStaffNotifications,
  reactivateStaff,
  resendStaffInvite,
  type StaffActionDeps,
  type StaffActor,
} from './staff-service';
import {
  commitStaffImport,
  getStaffImportBatch,
  validateStaffImport,
} from './bulk-import';

const assemblyParamsSchema = z.object({
  assemblyId: z.string().uuid(),
});

const staffParamsSchema = z.object({
  assemblyId: z.string().uuid(),
  userId: z.string().trim().min(1).max(100),
});

const batchParamsSchema = z.object({
  assemblyId: z.string().uuid(),
  batchId: z.string().uuid(),
});

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  role: z.string().trim().min(1).max(80),
});

const roleSchema = z.object({
  role: z.string().trim().min(1).max(80),
});

const commitSchema = z.object({
  batchId: z.string().uuid(),
});

const notificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
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

function provisioningDeps(app: FastifyInstance): StaffActionDeps | null {
  if (!config.zitadelProjectId) return null;
  return {
    prisma: app.prisma,
    zitadel: app.zitadelProvisioning,
    projectId: config.zitadelProjectId,
    audit: writeAudit,
  };
}

function actorFor(request: FastifyRequest, access: StaffAccessContext): StaffActor {
  return {
    actorId: request.auth.subject,
    actorRole: access.actorRole,
    actorName: request.auth.name,
    actorEmail: request.auth.email,
    requestId: request.id,
  };
}

async function sendError(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): Promise<FastifyReply> {
  if (error instanceof StaffAccessError || error instanceof StaffDomainError) {
    if (error instanceof StaffAccessError) {
      await writeDeniedRequestAudit(app.prisma, request, error);
    } else {
      markDenialAudited(request);
    }
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  request.log.error({ err: error }, 'staff operation failed');
  return reply.code(500).send({
    error: 'staff_operation_failed',
    message: 'Staff operation failed.',
  });
}

async function accessOrReply(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  assemblyId: string,
): Promise<StaffAccessContext | null> {
  try {
    return await resolveStaffAccess(app.prisma, request.auth, assemblyId);
  } catch (error) {
    await sendError(app, request, reply, error);
    return null;
  }
}

export async function registerStaffRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/assemblies/:assemblyId/staff', async (request, reply) => {
    const params = parseOrReply(assemblyParamsSchema, request.params, reply);
    if (!params) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return { data: await listStaff(deps, access) };
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.get('/v1/assemblies/:assemblyId/staff/notifications', async (request, reply) => {
    const params = parseOrReply(assemblyParamsSchema, request.params, reply);
    if (!params) return;
    const query = parseOrReply(notificationsQuerySchema, request.query ?? {}, reply);
    if (!query) return;
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      const data = await listStaffNotifications(app.prisma, access.assembly.id, query.limit ?? 50);
      return { data };
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.get('/v1/assemblies/:assemblyId/staff/bulk-import/:batchId', async (request, reply) => {
    const params = parseOrReply(batchParamsSchema, request.params, reply);
    if (!params) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return await getStaffImportBatch(deps, access, params.batchId);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.post('/v1/assemblies/:assemblyId/staff/bulk-import/validate', async (request, reply) => {
    const params = parseOrReply(assemblyParamsSchema, request.params, reply);
    if (!params) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return await validateStaffImport(deps, access, actorFor(request, access), request.body);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.post('/v1/assemblies/:assemblyId/staff/bulk-import/commit', async (request, reply) => {
    const params = parseOrReply(assemblyParamsSchema, request.params, reply);
    if (!params) return;
    const body = parseOrReply(commitSchema, request.body ?? {}, reply);
    if (!body) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return await commitStaffImport(deps, access, actorFor(request, access), body.batchId);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.post('/v1/assemblies/:assemblyId/staff/invite', async (request, reply) => {
    const params = parseOrReply(assemblyParamsSchema, request.params, reply);
    if (!params) return;
    const body = parseOrReply(inviteSchema, request.body ?? {}, reply);
    if (!body) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      const result = await inviteStaff(deps, access, actorFor(request, access), {
        name: body.name,
        email: body.email,
        phone: body.phone || undefined,
        role: body.role,
      });
      return reply.code(result.inviteStatus === 'INVITED' ? 201 : 200).send(result);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.patch('/v1/assemblies/:assemblyId/staff/:userId', async (request, reply) => {
    const params = parseOrReply(staffParamsSchema, request.params, reply);
    if (!params) return;
    const body = parseOrReply(roleSchema, request.body ?? {}, reply);
    if (!body) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return await editStaffRole(deps, access, actorFor(request, access), params.userId, body.role);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.post('/v1/assemblies/:assemblyId/staff/:userId/deactivate', async (request, reply) => {
    const params = parseOrReply(staffParamsSchema, request.params, reply);
    if (!params) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return await deactivateStaff(deps, access, actorFor(request, access), params.userId);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.post('/v1/assemblies/:assemblyId/staff/:userId/reactivate', async (request, reply) => {
    const params = parseOrReply(staffParamsSchema, request.params, reply);
    if (!params) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return await reactivateStaff(deps, access, actorFor(request, access), params.userId);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });

  app.post('/v1/assemblies/:assemblyId/staff/:userId/resend-invite', async (request, reply) => {
    const params = parseOrReply(staffParamsSchema, request.params, reply);
    if (!params) return;
    const deps = provisioningDeps(app);
    if (!deps) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for staff management.',
      });
    }
    const access = await accessOrReply(app, request, reply, params.assemblyId);
    if (!access) return;
    try {
      return await resendStaffInvite(deps, access, actorFor(request, access), params.userId);
    } catch (error) {
      return sendError(app, request, reply, error);
    }
  });
}
