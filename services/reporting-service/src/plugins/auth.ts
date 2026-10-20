import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import type { AuthContext } from '../types/global';

function parseRoles(payload: Record<string, unknown>): string[] {
  const roles = new Set<string>();
  for (const [key, value] of Object.entries(payload)) {
    if (key.startsWith('urn:zitadel:iam:org:project') && key.endsWith(':roles')) {
      if (value && typeof value === 'object') {
        for (const role of Object.keys(value as Record<string, unknown>)) {
          roles.add(role);
        }
      }
    }
  }
  return [...roles];
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

        const context = (payload['urn:idarms:context'] ?? {}) as {
          concessionId?: string;
          assemblyId?: string;
        };

        const roles = parseRoles(payload);
        const permissions = parsePermissions(payload['urn:idarms:permissions']);
        request.auth = {
          subject: typeof payload.sub === 'string' ? payload.sub : '',
          roles,
          permissions: permissions.length > 0 ? permissions : roles,
          concessionId: context.concessionId,
          assemblyId: context.assemblyId,
        };
      } catch {
        return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
      }
    });
  } else {
    app.addHook('onRequest', async (request) => {
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
