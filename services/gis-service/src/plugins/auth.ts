import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import { resolveOrgContext } from '../lib/org-context';
import { capabilitiesForRoles, parseRoleGrants, rolesInOrg } from '../lib/roles';
import type { AuthContext } from '../types/global';

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

const RESOURCE_OWNER_CLAIM = 'urn:zitadel:iam:user:resourceowner:id';

const PUBLIC_PATHS = ['/health/live', '/health/ready', '/metrics', '/docs'];

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
    if (!config.zitadelIssuer || !config.zitadelAudience || !config.zitadelJwksUri || !config.zitadelProjectId) {
      throw new Error(
        'ZITADEL_ISSUER, ZITADEL_AUDIENCE, ZITADEL_JWKS_URI and ZITADEL_PROJECT_ID are required when AUTH_MODE=zitadel',
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

        const roleGrants = parseRoleGrants(payload, config.zitadelProjectId);
        const resourceOwner = payload[RESOURCE_OWNER_CLAIM];
        const homeOrgId = typeof resourceOwner === 'string' && resourceOwner ? resourceOwner : undefined;
        // The home organisation comes from ZITADEL only, never from role grants.
        if (!homeOrgId) {
          request.log.warn({
            subject: typeof payload.sub === 'string' ? payload.sub : undefined,
            clientId: typeof payload.client_id === 'string' ? payload.client_id : payload.azp,
            missingClaim: RESOURCE_OWNER_CLAIM,
            claimsPresent: Object.keys(payload),
          }, 'Token refused: no home organisation claim (request the urn:zitadel:iam:user:resourceowner scope)');
          return reply.code(401).send({
            error: 'home_org_missing',
            message: 'The access token has no home organisation claim',
          });
        }
        // Permissions follow the organisation the tenant is resolved from; a
        // role granted in another organisation does not apply here.
        const roles = rolesInOrg(roleGrants, homeOrgId);
        const permissions = capabilitiesForRoles(roles);
        const authorizedOrgIds = roleGrants.length > 0
          ? [...new Set(roleGrants.map((grant) => grant.orgId))]
          : [homeOrgId];
        const context = await resolveOrgContext(homeOrgId, token);
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
    app.log.warn('AUTH_MODE=disabled: identity is taken from x-idarms-* headers. Local development only.');
    app.addHook('onRequest', async (request) => {
      const headerPermissions = parsePermissions(request.headers['x-idarms-permissions']);
      const headerRoles = parsePermissions(request.headers['x-idarms-roles']);
      request.auth = {
        subject: (request.headers['x-idarms-actor-id'] as string | undefined) ?? 'dev-actor',
        roles: headerRoles,
        permissions: headerPermissions.length > 0 ? headerPermissions : config.permissions,
        concessionId: request.headers['x-idarms-concession-id'] as string | undefined,
        assemblyId: request.headers['x-idarms-assembly-id'] as string | undefined,
        scopeLevel: (request.headers['x-idarms-scope-level'] as string | undefined) ?? 'CONCESSION',
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
