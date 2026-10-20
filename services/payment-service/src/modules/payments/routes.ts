import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config';
import { requirePermissions } from '../../plugins/auth';
import { byIdParamsSchema, checkoutBodySchema, listQuerySchema, webhookBodySchema } from './schemas';
import * as service from './service';
import type { CheckoutInput, WebhookInput } from './service';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/payments', {
    preHandler: requirePermissions(['payment:read']),
    schema: { querystring: listQuerySchema },
  }, async (request) => {
    const { concessionId, assemblyId } = request.auth;
    const rows = await service.list(app.prisma, { concessionId, assemblyId });
    return { data: rows };
  });

  app.get('/v1/payments/:id', {
    preHandler: requirePermissions(['payment:read']),
    schema: { params: byIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { concessionId, assemblyId } = request.auth;
    const row = await service.getById(app.prisma, id, { concessionId, assemblyId });
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
    return row;
  });

  app.post('/v1/payments/checkout', {
    preHandler: requirePermissions(['payment:checkout']),
    schema: { body: checkoutBodySchema },
  }, async (request, reply) => {
    const { concessionId, assemblyId } = request.auth;
    if (!concessionId || !assemblyId) {
      return reply.code(400).send({ error: 'bad_request', message: 'Missing concession/assembly context' });
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return reply.code(400).send({ error: 'bad_request', message: 'Idempotency-Key header is required' });
    }

    const result = await service.checkout(app.prisma, request.body as CheckoutInput, {
      concessionId,
      assemblyId,
      idempotencyKey,
    });

    if (result.status === 'conflict') {
      return reply.code(409).send({ error: 'conflict', message: 'Idempotency key reused with a different request' });
    }
    if (result.status === 'replayed') {
      return reply.code(201).send(result.response);
    }
    return reply.code(201).send(result.response);
  });

  app.post('/v1/payments/webhook', {
    config: { rawBody: true },
    schema: { body: webhookBodySchema },
  }, async (request, reply) => {
    if (config.gatewayWebhookSecret) {
      const signature = request.headers['x-gateway-signature'] as string | undefined;
      const expected = createHmac('sha256', config.gatewayWebhookSecret)
        .update(request.rawBody ?? '')
        .digest('hex');
      if (!signature || signature.toLowerCase() !== expected) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Invalid webhook signature' });
      }
    }

    const payment = await service.processWebhook(app.prisma, request.body as WebhookInput, {
      correlationId: request.id,
    });
    if (!payment) {
      return reply.code(404).send({ error: 'not_found', message: 'Payment not found' });
    }
    return payment;
  });
}
