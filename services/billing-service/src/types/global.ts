import type { PrismaClient } from '../../generated/prisma';

export interface AuthContext {
  subject: string;
  roles: string[];
  permissions: string[];
  concessionId?: string;
  assemblyId?: string;
  roleGrants?: Array<{ role: string; orgId: string; orgDomain?: string }>;
  homeOrgId?: string;
  authorizedOrgIds?: string[];
  scopeLevel?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}
