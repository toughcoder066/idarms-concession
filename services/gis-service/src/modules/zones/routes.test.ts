import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Header-based dev auth stands in for the verified token; config is read at import.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'disabled';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
});

import { registerAuthPlugin } from '../../plugins/auth';
import { registerRoutes } from './routes';

const CONCESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSEMBLY_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSEMBLY_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const prisma = {
  spatialZone: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(),
  },
};

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await registerAuthPlugin(app);
  app.decorate('prisma', prisma as never);
  await app.register(registerRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

const superAdmin = {
  'x-idarms-concession-id': CONCESSION_A,
  'x-idarms-roles': 'CONCESSION_SUPER_ADMIN',
  'x-idarms-scope-level': 'CONCESSION',
};

describe('GIS zone tenant scope (ADR-0002)', () => {
  it('lets the concession super admin list zones of every assembly in their concession', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/zones', headers: superAdmin });

    expect(response.statusCode).toBe(200);
    expect(prisma.spatialZone.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { concessionId: CONCESSION_A },
    }));
  });

  it('refuses a concession-level caller who is not the super admin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/zones',
      headers: { ...superAdmin, 'x-idarms-roles': 'ASSEMBLY_ADMIN' },
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.spatialZone.findMany).not.toHaveBeenCalled();
  });

  it('keeps assembly staff on their own assembly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/zones',
      headers: { 'x-idarms-concession-id': CONCESSION_A, 'x-idarms-assembly-id': ASSEMBLY_A },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.spatialZone.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A },
    }));
  });

  it('refuses a zone created without an assembly in the token, even when the body names one', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/zones',
      headers: superAdmin,
      payload: { assemblyId: ASSEMBLY_B, zoneCode: 'Z1', zoneName: 'Zone 1' },
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.spatialZone.create).not.toHaveBeenCalled();
  });

  it('refuses a zone created in another assembly than the caller own', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/zones',
      headers: { 'x-idarms-concession-id': CONCESSION_A, 'x-idarms-assembly-id': ASSEMBLY_A },
      payload: { assemblyId: ASSEMBLY_B, zoneCode: 'Z1', zoneName: 'Zone 1' },
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.spatialZone.create).not.toHaveBeenCalled();
  });
});
