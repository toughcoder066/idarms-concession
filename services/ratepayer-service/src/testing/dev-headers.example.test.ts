import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Header identity (AUTH_MODE=disabled) for route tests that are not about
// authentication: devHeaders(user) gives the tenant, roles and permissions a
// verified token would give that persona. inject() never opens a port, so the
// loopback-only listen guard does not apply here.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'disabled';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
});

vi.mock('dotenv/config', () => ({}));

import { registerRoutes } from '../modules/ratepayers/routes';
import { registerAuthPlugin } from '../plugins/auth';
import { devHeaders, TEST_ORGS, TEST_USERS } from './personas';

const prisma = { ratepayer: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) } };
let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await registerAuthPlugin(app);
  app.decorate('prisma', prisma as never);
  await app.register(registerRoutes);
  await app.ready();
});

afterAll(() => app.close());
beforeEach(() => vi.clearAllMocks());

describe('ratepayer list with header identity', () => {
  it('scopes to the persona assembly', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/ratepayers', headers: devHeaders(TEST_USERS.fieldAgentA1) });

    expect(response.statusCode).toBe(200);
    expect(prisma.ratepayer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ concessionId: TEST_ORGS.assemblyA1.concessionId, assemblyId: TEST_ORGS.assemblyA1.assemblyId }),
    }));
  });

  it('gives a persona with no role no permissions, not the service default', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/ratepayers', headers: devHeaders(TEST_USERS.noRoleA1) });

    expect(response.statusCode).toBe(403);
    expect(prisma.ratepayer.findMany).not.toHaveBeenCalled();
  });
});
