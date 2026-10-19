import type { PrismaClient } from '../../generated/prisma';

export interface AuthContext {
  subject: string;
  roles: string[];
  permissions: string[];
  concessionId?: string;
  assemblyId?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}
