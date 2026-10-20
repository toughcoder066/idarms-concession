import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
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
  const isPublicPath = (url: string): boolean =>
    config.publicPaths.some((path) => url === path || url.startsWith(`${path}?`));

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

        const context = (payload['urn:idarms:context'] ?? {}) as {
          concessionId?: string;
          assemblyId?: string;
        };

        request.auth = {
          subject: typeof payload.sub === 'string' ? payload.sub : '',
          roles: parsePermissions(payload['urn:zitadel:iam:org:project:roles']),
          permissions: parsePermissions(payload['urn:idarms:permissions']),
          concessionId: context.concessionId,
          assemblyId: context.assemblyId,
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
