import type { PrismaClient } from '../../generated/prisma';
import type { ZitadelStaffClient } from '../modules/provisioning/zitadel-client';

export interface AuthContext {
  subject: string;
  name?: string;
  email?: string;
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
    zitadelProvisioning: ZitadelStaffClient;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}
