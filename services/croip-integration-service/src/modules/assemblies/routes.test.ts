import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Header-based dev auth stands in for the verified token; config is read at import.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'disabled';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
});

import { registerAuthPlugin } from '../../plugins/auth';
import { registerAssemblyRoutes } from './routes';

const CONCESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AMA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KMA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function row(assemblyId: string, code: string) {
  return {
    assemblyId,
    concessionId: CONCESSION_A,
    regionId: null,
    code,
    name: `${code} Assembly`,
    category: null,
    contractStart: null,
    contractEnd: new Date('2099-12-31T00:00:00Z'),
    status: 'ACTIVE',
    source: 'MANUAL_IMPORT',
    importVersion: 1,
    importedAt: new Date('2026-11-02T00:00:00Z'),
  };
}

const prisma = {
  assignedAssembly: {
    findMany: vi.fn(async () => [row(AMA, 'AMA'), row(KMA, 'KMA')]),
    create: vi.fn(),
    update: vi.fn(),
  },
};

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await registerAuthPlugin(app);
  app.decorate('prisma', prisma as never);
  await app.register(registerAssemblyRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assigned assemblies endpoint', () => {
  it('shows the concession super admin every assigned assembly of their concession', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/assigned-assemblies',
      headers: {
        'x-idarms-concession-id': CONCESSION_A,
        'x-idarms-roles': 'CONCESSION_SUPER_ADMIN',
        'x-idarms-scope-level': 'PORTFOLIO',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((item: { code: string }) => item.code)).toEqual(['AMA', 'KMA']);
    expect(response.json().data[0].assignedNow).toBe(true);
    expect(prisma.assignedAssembly.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { concessionId: CONCESSION_A, status: 'ACTIVE' },
    }));
  });

  it('shows assembly staff only their own assembly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/assigned-assemblies',
      headers: { 'x-idarms-concession-id': CONCESSION_A, 'x-idarms-assembly-id': KMA },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((item: { code: string }) => item.code)).toEqual(['KMA']);
  });

  it('refuses a caller without tenant context', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/assigned-assemblies' });

    expect(response.statusCode).toBe(403);
    expect(prisma.assignedAssembly.findMany).not.toHaveBeenCalled();
  });

  it('offers no way to change the list over HTTP', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/v1/assigned-assemblies',
        headers: { 'x-idarms-concession-id': CONCESSION_A, 'x-idarms-assembly-id': AMA },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    }
    expect(prisma.assignedAssembly.create).not.toHaveBeenCalled();
    expect(prisma.assignedAssembly.update).not.toHaveBeenCalled();
  });
});
