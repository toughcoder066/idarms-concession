import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config';
import { requireAny } from '../../plugins/auth';
import { byIdParamsSchema, listQuerySchema } from './schemas';
import { canPublishRates, scopeFromAuth } from './context';
import { listContracts, getContract, createContract, updateContract } from './contracts';
import { listAssemblies, getAssembly, createAssembly, updateAssembly } from './assemblies';
import { getRateMatrix, saveRates, submitRates } from './rates';
import { listApprovals, decideApproval } from './approvals';
import { getTarget, saveTarget } from './targets';
import { listAgents, assignAgent, removeAgent } from './agents';
import { listAudit, writeAudit } from './audit';
import { listLookups } from './lookups';
import { resolveOrgContext } from '../orgs/context';
import {
  OnboardingError,
  onboardAssembly,
  resolveOnboardingActorRole,
} from '../provisioning/assembly-onboarding';
import { getAccessibleAssemblies, invalidateAccessDirectory } from '../access-directory/service';
import { writeDeniedRequestAudit } from '../audit/security';
import { assignedAssemblyChecker } from '../provisioning/assigned-assemblies';
import {
  agentAssignmentSchema,
  approvalDecisionSchema,
  assemblyCreateSchema,
  assemblyOnboardingSchema,
  assemblyUpdateSchema,
  contractCreateSchema,
  contractUpdateSchema,
  ratesSaveSchema,
  submitRatesSchema,
  targetSchema,
} from './schemas';

type Query = { fiscalYear?: number; limit?: number; status?: string };

const READ_ROLES = [
  'CONCESSION_SUPER_ADMIN',
  'ASSEMBLY_ADMIN',
  'FINANCE_OFFICER',
  'FIELD_OPS_MANAGER',
  'ASSEMBLY_VIEWER',
  'SECRETARY',
];
const ADMIN_ROLES = ['CONCESSION_SUPER_ADMIN', 'ASSEMBLY_ADMIN'];
const CONCESSION_MANAGE_ROLES = ['CONCESSION_SUPER_ADMIN'];
// Rates and agent assignment are assembly operations; the super admin only views them (ADR-0002).
const RATE_EDIT_ROLES = ['ASSEMBLY_ADMIN', 'FINANCE_OFFICER'];
const TARGET_ROLES = ADMIN_ROLES;
const AGENT_ROLES = ['ASSEMBLY_ADMIN', 'FIELD_OPS_MANAGER'];
const AUDIT_ROLES = ['CONCESSION_SUPER_ADMIN', 'ASSEMBLY_ADMIN', 'ASSEMBLY_VIEWER'];

function fiscalYear(query: unknown): number {
  const value = Number((query as Query | undefined)?.fiscalYear);
  return Number.isInteger(value) && value >= 2000 && value <= 2200 ? value : new Date().getUTCFullYear();
}

function scopeOrReply(request: FastifyRequest, reply: FastifyReply) {
  const scope = scopeFromAuth(request.auth);
  if (!scope) {
    reply.code(400).send({ error: 'missing_context', message: 'A concession context is required.' });
    return null;
  }
  return scope;
}

function parseBody<T>(
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

function fail(reply: FastifyReply, error?: string) {
  const key = error ?? 'bad_request';
  const status: Record<string, number> = {
    not_found: 404,
    contract_not_found: 400,
    rates_locked: 409,
    no_rates: 400,
    already_published: 409,
    approval_exists: 409,
    dual_control: 409,
    already_resolved: 409,
    invalid_lookup: 400,
    no_pending_rates: 409,
  };
  const messages: Record<string, string> = {
    dual_control: 'A different authorised user must approve this request.',
    rates_locked: 'These rates are submitted or published and cannot be edited.',
    already_published: 'These rates have already been published.',
    approval_exists: 'A rate-matrix approval is already pending for this assembly.',
    already_resolved: 'This request has already been resolved.',
    no_rates: 'Save at least one rate row before submitting.',
    no_pending_rates: 'No pending rate rows were found for this approval.',
    invalid_lookup: 'A property type and usage combination is invalid.',
    contract_not_found: 'The concession contract is not configured.',
  };
  return reply.code(status[key] ?? 400).send({ error: key, message: messages[key] ?? key.replaceAll('_', ' ') });
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // The caller's own tenant: the home org of the verified token, never an org the
  // caller names. Only for users who hold an iDARMS role in that org; knowing it
  // grants nothing, and every route still checks its own permissions and tenant
  // (ADR-0003 decision 10).
  app.get('/v1/org-context/me', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const orgId = request.auth.homeOrgId;
    if (!orgId) {
      return reply.code(401).send({ error: 'home_org_missing', message: 'The access token has no home organisation claim' });
    }
    if (request.auth.roles.length === 0) {
      return reply.code(403).send({ error: 'no_role', message: 'No iDARMS role in the home organisation' });
    }
    const context = await resolveOrgContext(app.prisma, orgId);
    if (!context) {
      return reply.code(404).send({ error: 'not_found', message: 'No iDARMS context for this organization' });
    }
    return context;
  });

  app.get('/v1/access-directory/assemblies', {
    preHandler: requireAny(['concession:read', 'directory:read'], ['CONCESSION_SUPER_ADMIN']),
  }, async (request, reply) => {
    if (!config.zitadelProjectId) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID is required for the Access Directory.',
      });
    }
    const entries = await getAccessibleAssemblies(app.prisma, app.zitadelProvisioning, {
      userId: request.auth.subject,
      projectId: config.zitadelProjectId,
      concessionId: request.auth.concessionId,
      ttlMs: config.accessDirectoryCacheTtlMs,
    });
    return { data: entries, cacheTtlMs: config.accessDirectoryCacheTtlMs };
  });

  app.get('/v1/contracts', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { querystring: listQuerySchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    return { data: await listContracts(app.prisma, scope.concessionId) };
  });

  app.get('/v1/contracts/:id', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const contract = await getContract(app.prisma, id, scope.concessionId);
    if (!contract) return fail(reply, 'not_found');
    return contract;
  });

  app.post('/v1/contracts', {
    preHandler: requireAny(['concession:manage'], CONCESSION_MANAGE_ROLES),
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const input = parseBody(contractCreateSchema, request.body, reply);
    if (!input) return;
    if (input.id && input.id !== scope.concessionId) {
      return reply.code(403).send({ error: 'forbidden', message: 'A contract can only be created for your concession context.' });
    }
    if (input.stateRevenueShare + input.concessionaireShare !== 100) {
      return reply.code(400).send({ error: 'invalid_split', message: 'Revenue shares must total 100%.' });
    }
    const contract = await createContract(app.prisma, { ...input, id: scope.concessionId }, {
      actorId: request.auth.subject,
      concessionId: scope.concessionId,
      requestId: request.id,
    });
    return reply.code(201).send(contract);
  });

  app.patch('/v1/contracts/:id', {
    preHandler: requireAny(['concession:manage'], CONCESSION_MANAGE_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const input = parseBody(contractUpdateSchema, request.body, reply);
    if (!input) return;
    if ((input.stateRevenueShare === undefined) !== (input.concessionaireShare === undefined)) {
      return reply.code(400).send({ error: 'invalid_split', message: 'Provide both revenue shares together.' });
    }
    if (
      input.stateRevenueShare !== undefined
      && input.concessionaireShare !== undefined
      && input.stateRevenueShare + input.concessionaireShare !== 100
    ) {
      return reply.code(400).send({ error: 'invalid_split', message: 'Revenue shares must total 100%.' });
    }
    const contract = await updateContract(app.prisma, id, scope.concessionId, input, {
      actorId: request.auth.subject,
      requestId: request.id,
    });
    if (!contract) return fail(reply, 'not_found');
    return contract;
  });

  app.get('/v1/concessions', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { querystring: listQuerySchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    return { data: await listContracts(app.prisma, scope.concessionId) };
  });

  app.get('/v1/concessions/:id', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const contract = await getContract(app.prisma, id, scope.concessionId);
    if (!contract) return fail(reply, 'not_found');
    return contract;
  });

  app.get('/v1/assemblies', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { querystring: listQuerySchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    return { data: await listAssemblies(app.prisma, scope, fiscalYear(request.query)) };
  });

  app.post('/v1/assemblies', {
    preHandler: requireAny(['concession:manage'], CONCESSION_MANAGE_ROLES),
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const input = parseBody(assemblyCreateSchema, request.body, reply);
    if (!input) return;
    const result = await createAssembly(app.prisma, input, {
      actorId: request.auth.subject,
      concessionId: scope.concessionId,
      requestId: request.id,
    });
    if ('error' in result) return fail(reply, result.error);
    return reply.code(201).send(result.assembly);
  });

  app.post('/v1/assemblies/:id/onboard', {
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorRole = resolveOnboardingActorRole(request.auth, {
      platformAdminUserId: config.platformAdminUserId,
    });
    if (!actorRole) {
      const message = 'Only a Concession Super Admin or Platform Admin can onboard an assembly.';
      await writeDeniedRequestAudit(app.prisma, request, {
        code: 'forbidden',
        statusCode: 403,
        message,
        auditContext: { assemblyId: id },
      });
      return reply.code(403).send({
        error: 'forbidden',
        message,
      });
    }
    if (!config.zitadelProjectId || !config.zitadelProjectOwnerOrgId) {
      return reply.code(503).send({
        error: 'provisioning_not_configured',
        message: 'ZITADEL_PROJECT_ID and ZITADEL_PROJECT_OWNER_ORG_ID are required.',
      });
    }
    const input = parseBody(assemblyOnboardingSchema, request.body ?? {}, reply);
    if (!input) return;
    // A super admin acts concession-wide only from the CONCESSION-scoped home
    // org (the registry sets scopeLevel), with the grant held in that org.
    const atConcessionLevel = request.auth.scopeLevel === 'CONCESSION';
    const concessionAuthorized = actorRole === 'PLATFORM_ADMIN'
      || (atConcessionLevel && (request.auth.roleGrants ?? []).some(
        (grant) => grant.role === 'CONCESSION_SUPER_ADMIN' && grant.orgId === request.auth.homeOrgId,
      ))
      || (atConcessionLevel && (request.auth.roleGrants?.length ?? 0) === 0
        && request.auth.roles.includes('CONCESSION_SUPER_ADMIN'));

    try {
      const result = await onboardAssembly({
        prisma: app.prisma,
        zitadel: app.zitadelProvisioning,
        config: { projectId: config.zitadelProjectId, projectOwnerOrgId: config.zitadelProjectOwnerOrgId },
        isAssigned: assignedAssemblyChecker({ baseUrl: config.croipIntegrationUrl, headers: request.headers }),
        audit: (entry) => app.prisma.$transaction((tx) => writeAudit(tx, entry)),
        invalidateAccessDirectory,
      }, {
        assemblyId: id,
        firstAdmin: input.firstAdmin,
        actor: {
          actorId: request.auth.subject,
          actorRole,
          actorName: request.auth.name,
          actorEmail: request.auth.email,
          requestId: request.id,
          expectedConcessionId: request.auth.concessionId,
          concessionAuthorized,
        },
      });
      return reply.code(result.alreadyProvisioned ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof OnboardingError) {
        await writeDeniedRequestAudit(app.prisma, request, error);
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
          rolledBack: error.rolledBack,
        });
      }
      request.log.error({ err: error }, 'assembly onboarding failed');
      return reply.code(500).send({
        error: 'onboarding_failed',
        message: 'Assembly onboarding failed unexpectedly.',
      });
    }
  });

  app.get('/v1/assemblies/:id', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const assembly = await getAssembly(app.prisma, id, scope, fiscalYear(request.query));
    if (!assembly) return fail(reply, 'not_found');
    return assembly;
  });

  app.patch('/v1/assemblies/:id', {
    preHandler: requireAny(['assembly:manage', 'concession:manage'], ADMIN_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const input = parseBody(assemblyUpdateSchema, request.body, reply);
    if (!input) return;
    const assembly = await updateAssembly(app.prisma, id, scope, input, {
      actorId: request.auth.subject,
      requestId: request.id,
    });
    if (!assembly) return fail(reply, 'not_found');
    return assembly;
  });

  app.get('/v1/assemblies/:id/rates', {
    preHandler: requireAny(['fee_fixing:read'], READ_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const matrix = await getRateMatrix(app.prisma, id, scope, fiscalYear(request.query));
    if (!matrix) return fail(reply, 'not_found');
    return matrix;
  });

  app.put('/v1/assemblies/:id/rates', {
    preHandler: requireAny(['fee_fixing:manage'], RATE_EDIT_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const input = parseBody(ratesSaveSchema, request.body, reply);
    if (!input) return;
    const result = await saveRates(app.prisma, id, scope, input, {
      actorId: request.auth.subject,
      requestId: request.id,
    });
    if ('error' in result) return fail(reply, result.error);
    return result;
  });

  app.post('/v1/assemblies/:id/rates/submit', {
    preHandler: requireAny(['fee_fixing:manage'], RATE_EDIT_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const input = parseBody(submitRatesSchema, request.body, reply);
    if (!input) return;
    const result = await submitRates(app.prisma, id, scope, input, {
      actorId: request.auth.subject,
      roles: request.auth.roles,
      requestId: request.id,
    });
    if ('error' in result) return fail(reply, result.error);
    return reply.code(201).send(result);
  });

  app.get('/v1/assemblies/:id/target', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const target = await getTarget(app.prisma, id, scope, fiscalYear(request.query));
    if (!target) return fail(reply, 'not_found');
    return target;
  });

  app.put('/v1/assemblies/:id/target', {
    preHandler: requireAny(['target:manage'], TARGET_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const input = parseBody(targetSchema, request.body, reply);
    if (!input) return;
    const target = await saveTarget(app.prisma, id, scope, input, {
      actorId: request.auth.subject,
      requestId: request.id,
    });
    if (!target) return fail(reply, 'not_found');
    return target;
  });

  app.get('/v1/assemblies/:id/agents', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const agents = await listAgents(app.prisma, id, scope);
    if (!agents) return fail(reply, 'not_found');
    return { data: agents };
  });

  app.post('/v1/assemblies/:id/agents', {
    preHandler: requireAny(['agent:manage'], AGENT_ROLES),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id } = request.params as { id: string };
    const input = parseBody(agentAssignmentSchema, request.body, reply);
    if (!input) return;
    const assignment = await assignAgent(app.prisma, id, scope, input, {
      actorId: request.auth.subject,
      requestId: request.id,
    });
    if (!assignment) return fail(reply, 'not_found');
    return reply.code(201).send(assignment);
  });

  app.delete('/v1/assemblies/:id/agents/:agentId', {
    preHandler: requireAny(['agent:manage'], AGENT_ROLES),
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const { id, agentId } = request.params as { id: string; agentId: string };
    const result = await removeAgent(app.prisma, id, agentId, scope, {
      actorId: request.auth.subject,
      requestId: request.id,
    });
    if (!result) return fail(reply, 'not_found');
    return result;
  });

  app.get('/v1/approvals', {
    preHandler: requireAny(['approval:read'], READ_ROLES),
    schema: { querystring: listQuerySchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const status = (request.query as Query | undefined)?.status;
    return { data: await listApprovals(app.prisma, scope, status) };
  });

  app.post('/v1/approvals/:id/approve', {
    preHandler: requireAny(['approval:manage', 'fee_fixing:publish'], ['ASSEMBLY_ADMIN']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    if (!canPublishRates(request.auth)) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'Concession Support cannot publish MMDA rates. An Assembly Administrator must approve this request.',
      });
    }
    const input = parseBody(approvalDecisionSchema, request.body ?? {}, reply);
    if (!input) return;
    const { id } = request.params as { id: string };
    const result = await decideApproval(app.prisma, id, scope, 'APPROVE', {
      auth: request.auth,
      requestId: request.id,
      note: input.note,
    });
    if ('error' in result) return fail(reply, result.error);
    return result;
  });

  app.post('/v1/approvals/:id/reject', {
    preHandler: requireAny(['approval:manage'], ['ASSEMBLY_ADMIN']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const input = parseBody(approvalDecisionSchema, request.body ?? {}, reply);
    if (!input) return;
    const { id } = request.params as { id: string };
    const result = await decideApproval(app.prisma, id, scope, 'REJECT', {
      auth: request.auth,
      requestId: request.id,
      note: input.note,
    });
    if ('error' in result) return fail(reply, result.error);
    return result;
  });

  app.get('/v1/audit', {
    preHandler: requireAny(['audit:read'], AUDIT_ROLES),
    schema: { querystring: listQuerySchema },
  }, async (request, reply) => {
    const scope = scopeOrReply(request, reply);
    if (!scope) return;
    const limit = Number((request.query as Query | undefined)?.limit ?? 200);
    return { data: await listAudit(app.prisma, scope, limit) };
  });

  app.get('/v1/lookups', {
    preHandler: requireAny(['assembly:read', 'concession:read'], READ_ROLES),
  }, async (_request, reply) => {
    return { data: await listLookups(app.prisma) };
  });
}

