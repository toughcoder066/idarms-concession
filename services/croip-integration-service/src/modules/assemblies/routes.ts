import type { FastifyInstance } from 'fastify';
import { requirePermissions, requireReadScope, readScopeOf } from '../../plugins/auth';
import { ManualImportBoundaryProvider } from './boundary-provider';
import { listQuerySchema } from './schemas';

/**
 * Read-only. The list is written only by the assembly import (no write route exists).
 * The super admin sees every assembly of their concession; assembly staff see only
 * their own (ADR-0002).
 */
export async function registerAssemblyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/assigned-assemblies', {
    preHandler: [requirePermissions(['assembly:read']), requireReadScope],
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const scope = readScopeOf(request);
    const { includeRemoved } = request.query as { includeRemoved?: boolean };
    const provider = new ManualImportBoundaryProvider(app.prisma, scope.concessionId);
    const rows = await provider.listAssigned({ includeRemoved });
    return {
      data: 'assemblyId' in scope ? rows.filter((row) => row.assemblyId === scope.assemblyId) : rows,
    };
  });
}
