import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import { resolveOrgContext as resolveOrgContextFromDb } from '../modules/orgs/context';
import { writeDeniedRequestAudit } from '../modules/audit/security';
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

const PUBLIC_PATHS = ['/health/live', '/health/ready', '/metrics', '/docs', '/v1/org-context'];

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0];
  return PUBLIC_PATHS.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`));
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

  if (config.authMode === 'zitadel') {
    if (!config.zitadelIssuer || !config.zitadelAudience || !config.zitadelJwksUri) {
      throw new Error(
        'ZITADEL_ISSUER, ZITADEL_AUDIENCE and ZITADEL_JWKS_URI are required when AUTH_MODE=zitadel',
      );
    }

    const jwks = createRemoteJWKSet(new URL(config.zitadelJwksUri));

    app.addHook('onRequest', async (request, reply) => {
      if (isPublicPath(request.url)) {
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
        const resourceOwnerId = typeof payload['urn:zitadel:iam:user:resourceowner:id'] === 'string'
          ? payload['urn:zitadel:iam:user:resourceowner:id']
          : undefined;
        // Local ZITADEL access tokens can omit the resource-owner claim. For an
        // Assembly Admin, the org in the ASSEMBLY_ADMIN role grant is the home
        // org. Do not infer a Super Admin home org from grants because a Super
        // Admin has grants in many assembly orgs.
        const homeOrgId = resourceOwnerId
          ?? roleGrants.find((grant) => grant.role === 'ASSEMBLY_ADMIN')?.orgId;
        const authorizedOrgIds = roleGrants.length > 0
          ? [...new Set(roleGrants.map((grant) => grant.orgId))]
          : homeOrgId ? [homeOrgId] : [];
        const context = homeOrgId ? await resolveOrgContextFromDb(app.prisma, homeOrgId) : null;
        request.auth = {
          subject: typeof payload.sub === 'string' ? payload.sub : '',
          name: typeof payload.name === 'string'
            ? payload.name
            : typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined,
          email: typeof payload.email === 'string' ? payload.email : undefined,
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
        const match = request.url.match(/^\/v1\/assemblies\/([0-9a-fA-F-]{36})(?:\/|$)/);
        if (match) {
          await writeDeniedRequestAudit(app.prisma, request, {
            code: 'unauthorized',
            statusCode: 401,
            message: 'Invalid or expired token',
            auditContext: { assemblyId: match[1] },
          });
        }
        return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
      }
    });
  } else {
    app.addHook('onRequest', async (request) => {
      const headerPermissions = parsePermissions(request.headers['x-idarms-permissions']);
      const headerRoles = parsePermissions(request.headers['x-idarms-roles']);
      const headerAuthorizedOrgIds = parsePermissions(request.headers['x-idarms-authorized-org-ids']);
      const headerOrgId = request.headers['x-idarms-org-id'] as string | undefined;
      request.auth = {
        subject: (request.headers['x-idarms-actor-id'] as string | undefined) ?? 'dev-actor',
        name: request.headers['x-idarms-actor-name'] as string | undefined,
        email: request.headers['x-idarms-actor-email'] as string | undefined,
        roles: headerRoles,
        permissions: headerPermissions.length > 0 ? headerPermissions : config.permissions,
        concessionId: request.headers['x-idarms-concession-id'] as string | undefined,
        assemblyId: request.headers['x-idarms-assembly-id'] as string | undefined,
        scopeLevel: (request.headers['x-idarms-scope-level'] as string | undefined) ?? 'PORTFOLIO',
        homeOrgId: headerOrgId,
        authorizedOrgIds: headerAuthorizedOrgIds.length > 0
          ? headerAuthorizedOrgIds
          : headerOrgId ? [headerOrgId] : undefined,
      };
    });
  }
}

export function hasRoleOrPermission(
  auth: AuthContext,
  roles: readonly string[],
  permissions: readonly string[],
): boolean {
  return auth.roles.some((role) => roles.includes(role))
    || auth.permissions.some((permission) => permissions.includes(permission));
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

export function requireAny(permissions: string[], roles: string[] = []) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const allowed = permissions.some((permission) => request.auth.permissions.includes(permission))
      || roles.some((role) => request.auth.roles.includes(role));
    if (!allowed) {
      await reply.code(403).send({ error: 'forbidden', message: 'Insufficient permissions' });
    }
  };
}
