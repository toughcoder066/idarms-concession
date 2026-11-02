import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
  syncRecord: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
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

describe('sync records stay closed until they are tenant-scoped', () => {
  it('refuses a list without tenant context', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/sync' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'tenant_unresolved' });
  });

  it('does not list sync records even for a resolved tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/sync',
      headers: { 'x-idarms-concession-id': CONCESSION_A, 'x-idarms-assembly-id': ASSEMBLY_A },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'not_available' });
    expect(prisma.syncRecord.findMany).not.toHaveBeenCalled();
  });

  it('does not return a single sync record even for a resolved tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/sync/any-id',
      headers: { 'x-idarms-concession-id': CONCESSION_A, 'x-idarms-assembly-id': ASSEMBLY_A },
    });

    expect(response.statusCode).toBe(503);
    expect(prisma.syncRecord.findFirst).not.toHaveBeenCalled();
  });
});
