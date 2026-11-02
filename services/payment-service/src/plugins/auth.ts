import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import { resolveOrgContext } from '../lib/org-context';
import { capabilitiesForRoles, parseRoleGrants } from '../lib/roles';
import type { AuthContext } from '../types/global';

function parseRoles(payload: Record<string, unknown>): string[] {
  return [...new Set(parseRoleGrants(payload).map((grant) => grant.role))];
}

function parsePermissions(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>);
  }
  return [];
}

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

const PUBLIC_PATHS = ['/health/live', '/health/ready', '/metrics', '/docs'];

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0];
  const staticHit = PUBLIC_PATHS.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`));
  const configHit = config.publicPaths.some((publicPath) => url === publicPath || url.startsWith(`${publicPath}?`));
  return staticHit || configHit;
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  const defaultAuth: AuthContext = {
    subject: 'unauthenticated',
    roles: [],
    permissions: [],
  };

  app.decorateRequest('auth', {
    getter(this: FastifyRequest): AuthContext {
      const holder = this as FastifyRequest & { __idarmsAuth?: AuthContext };
      return holder.__idarmsAuth ?? defaultAuth;
    },
    setter(this: FastifyRequest, value: AuthContext): void {
      (this as FastifyRequest & { __idarmsAuth?: AuthContext }).__idarmsAuth = value;
    },
  });

  const systemAuth: AuthContext = { subject: 'system', roles: [], permissions: ['payment:webhook'] };

  if (config.authMode === 'zitadel') {
    if (!config.zitadelIssuer || !config.zitadelAudience || !config.zitadelJwksUri) {
      throw new Error(
        'ZITADEL_ISSUER, ZITADEL_AUDIENCE and ZITADEL_JWKS_URI are required when AUTH_MODE=zitadel',
      );
    }

    const jwks = createRemoteJWKSet(new URL(config.zitadelJwksUri));

    app.addHook('onRequest', async (request, reply) => {
      if (isPublicPath(request.url)) {
        request.auth = systemAuth;
        return;
      }
      const token = extractBearer(request);
      if (!token) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
      }

      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: config.zitadelIssuer,
          audience: config.zitadelAudience,
        });

        const roles = parseRoles(payload);
        const roleGrants = parseRoleGrants(payload);
        const permissions = [
          ...new Set([
            ...capabilitiesForRoles(roles),
            ...parsePermissions(payload['urn:idarms:permissions']),
          ]),
        ];
        const homeOrgId = typeof payload['urn:zitadel:iam:user:resourceowner:id'] === 'string'
          ? payload['urn:zitadel:iam:user:resourceowner:id']
          : undefined;
        const authorizedOrgIds = roleGrants.length > 0
          ? [...new Set(roleGrants.map((grant) => grant.orgId))]
          : homeOrgId ? [homeOrgId] : [];
        const context = homeOrgId ? await resolveOrgContext(homeOrgId) : null;
        request.auth = {
          subject: typeof payload.sub === 'string' ? payload.sub : '',
          roles,
          permissions,
          roleGrants,
          homeOrgId,
          authorizedOrgIds,
          concessionId: context?.concessionId,
          assemblyId: context?.assemblyId ?? undefined,
          scopeLevel: context?.scope,
        };
      } catch {
        return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
      }
    });
  } else {
    app.addHook('onRequest', async (request) => {
      if (isPublicPath(request.url)) {
        request.auth = systemAuth;
        return;
      }
      const headerPermissions = parsePermissions(request.headers['x-idarms-permissions']);
      request.auth = {
        subject: (request.headers['x-idarms-actor-id'] as string | undefined) ?? 'dev-actor',
        roles: [],
        permissions: headerPermissions.length > 0 ? headerPermissions : config.permissions,
        concessionId: request.headers['x-idarms-concession-id'] as string | undefined,
        assemblyId: request.headers['x-idarms-assembly-id'] as string | undefined,
      };
    });
  }
}

export function requirePermissions(required: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const granted = request.auth.permissions;
    const allowed = required.some((permission) => granted.includes(permission));
    if (!allowed) {
      await reply.code(403).send({ error: 'forbidden', message: 'Insufficient permissions' });
    }
  };
}

export interface TenantContext {
  concessionId: string;
  assemblyId: string;
}

/**
 * Fail closed: a request whose concession or assembly could not be resolved
 * never reaches a query. Prisma drops undefined filter keys, so letting an
 * unresolved context through would return every tenant's rows.
 */
export async function requireTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { concessionId, assemblyId } = request.auth;
  if (!concessionId || !assemblyId) {
    await reply.code(403).send({
      error: 'tenant_unresolved',
      message: 'Concession and assembly context could not be resolved',
    });
  }
}

/** Tenant context of a request that has passed requireTenant. */
export function tenantOf(request: FastifyRequest): TenantContext {
  const { concessionId, assemblyId } = request.auth;
  if (!concessionId || !assemblyId) {
    throw new Error('tenantOf called on a route without requireTenant');
  }
  return { concessionId, assemblyId };
}
