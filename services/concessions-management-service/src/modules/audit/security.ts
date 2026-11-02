import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from '../concessions/audit';

export interface DeniedRequestAuditContext {
  assemblyId?: string;
  concessionId?: string;
  assemblyName?: string;
}

export interface DeniedRequestError {
  code: string;
  statusCode: number;
  message: string;
  auditContext?: DeniedRequestAuditContext;
}

export function markDenialAudited(request: FastifyRequest): void {
  (request as FastifyRequest & { __idarmsDenialAudited?: boolean }).__idarmsDenialAudited = true;
}

export function wasDenialAudited(request: FastifyRequest): boolean {
  return Boolean((request as FastifyRequest & { __idarmsDenialAudited?: boolean }).__idarmsDenialAudited);
}

/**
 * Records a rejected protected request against the target assembly. Denials are
 * security-relevant events: without them, a cross-org probing attempt leaves no
 * trace in the assembly audit trail.
 */
export async function writeDeniedRequestAudit(
  prisma: PrismaClient,
  request: FastifyRequest,
  error: DeniedRequestError,
): Promise<void> {
  if (error.statusCode !== 401 && error.statusCode !== 403 && error.statusCode !== 404) return;
  markDenialAudited(request);
  const context = error.auditContext;
  const path = request.url.split('?')[0];
  try {
    await prisma.$transaction((tx) => writeAudit(tx, {
      actorId: request.auth.subject || 'unknown',
      actorRole: request.auth.roles[0] ?? 'UNKNOWN',
      actorName: request.auth.name,
      actorEmail: request.auth.email,
      concessionId: context?.concessionId,
      assemblyId: context?.assemblyId,
      action: 'security.request_denied',
      resourceType: 'Assembly',
      resourceId: context?.assemblyId,
      requestId: request.id,
      outcome: 'DENIED',
      humanReadable: `Denied ${request.method} ${path} for ${request.auth.email ?? request.auth.subject ?? 'an unknown actor'}: ${error.message}`,
      metadata: {
        statusCode: error.statusCode,
        code: error.code,
        method: request.method,
        path,
        targetAssemblyId: context?.assemblyId ?? null,
        targetAssemblyName: context?.assemblyName ?? null,
      },
    }));
  } catch (auditError) {
    request.log.error({ err: auditError }, 'failed to write denied-request audit entry');
  }
}
