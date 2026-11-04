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

const prisma = {
  property: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
    property: { findFirst: vi.fn(async () => null) },
  })),
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

function tenantHeaders(concessionId?: string, assemblyId?: string) {
  return {
    ...(concessionId ? { 'x-idarms-concession-id': concessionId } : {}),
    ...(assemblyId ? { 'x-idarms-assembly-id': assemblyId } : {}),
  };
}

describe('property replica tenant isolation', () => {
  it('refuses a list when no tenant context is resolved and never queries', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/properties' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'tenant_unresolved' });
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });

  it('refuses a list when only the assembly is resolved', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/properties',
      headers: tenantHeaders(undefined, ASSEMBLY_A),
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });

  it('filters a list by exactly the caller concession and assembly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/properties',
      headers: tenantHeaders(CONCESSION_A, ASSEMBLY_A),
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.property.findMany).toHaveBeenCalledWith({
      where: { concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A },
    });
  });

  it('scopes a get by id to the caller tenant, so another tenant row is not found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/properties/row-of-another-tenant',
      headers: tenantHeaders(CONCESSION_A, ASSEMBLY_A),
    });

    expect(response.statusCode).toBe(404);
    expect(prisma.property.findFirst).toHaveBeenCalledWith({
      where: { id: 'row-of-another-tenant', concessionId: CONCESSION_A, assemblyId: ASSEMBLY_A },
    });
  });

  it('lets the concession super admin read every assembly of their own concession only (ADR-0002)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/properties/row-in-any-assembly',
      headers: {
        ...tenantHeaders(CONCESSION_A),
        'x-idarms-roles': 'CONCESSION_SUPER_ADMIN',
        'x-idarms-scope-level': 'CONCESSION',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(prisma.property.findFirst).toHaveBeenCalledWith({
      where: { id: 'row-in-any-assembly', concessionId: CONCESSION_A },
    });
  });

  it('never lets the concession super admin verify a property (oversight only, ADR-0002)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/properties/some-id/verify',
      headers: {
        ...tenantHeaders(CONCESSION_A),
        'x-idarms-roles': 'CONCESSION_SUPER_ADMIN',
        'x-idarms-scope-level': 'CONCESSION',
      },
      payload: { status: 'APPROVED' },
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a verification without tenant context and never opens a transaction', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/properties/some-id/verify',
      payload: { status: 'APPROVED' },
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
