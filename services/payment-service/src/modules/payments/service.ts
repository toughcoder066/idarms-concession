import { createHash, randomUUID } from 'node:crypto';
import type { Payment, PrismaClient } from '../../../generated/prisma';
import { appendOutboxEvent } from '../../messaging/outbox';
import { buildEnvelope } from '../../messaging/events';

export interface TenantScope {
  concessionId?: string;
  assemblyId?: string;
}

export async function list(prisma: PrismaClient, scope: TenantScope) {
  return prisma.payment.findMany({
    where: { concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: TenantScope) {
  return prisma.payment.findFirst({
    where: { id, concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}

export interface CheckoutInput {
  billId: string;
  amount: number;
  channel: 'MOMO' | 'CARD';
}

export interface CheckoutContext {
  concessionId: string;
  assemblyId: string;
  idempotencyKey: string;
}

export type CheckoutResult =
  | { status: 'created'; payment: Payment }
  | { status: 'replayed'; responseBody: unknown }
  | { status: 'conflict' };

/**
 * Idempotent checkout initiation. An Idempotency-Key must be supplied so that a
 * client retry cannot create a second payment intent.
 */
export async function checkout(
  prisma: PrismaClient,
  input: CheckoutInput,
  context: CheckoutContext,
): Promise<CheckoutResult> {
  const { concessionId, assemblyId, idempotencyKey } = context;
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { concessionId_idempotencyKey: { concessionId, idempotencyKey } },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return { status: 'conflict' };
    }
    return { status: 'replayed', responseBody: existing.responseBody };
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        concessionId,
        assemblyId,
        billId: input.billId,
        amount: input.amount,
        channel: input.channel,
        gatewayRef: `GW-${randomUUID()}`,
        status: 'PENDING',
      },
    });

    const responseBody = {
      paymentId: created.id,
      gatewayRef: created.gatewayRef,
      status: created.status,
    };

    await tx.idempotencyRecord.create({
      data: {
        concessionId,
        idempotencyKey,
        requestHash,
        responseStatus: 201,
        responseBody,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return created;
  });

  return { status: 'created', payment };
}

export interface WebhookInput {
  gatewayRef: string;
  status: 'SUCCESSFUL' | 'FAILED';
  amount?: number;
}

/**
 * Gateway callback. On success the payment is finalised and
 * payment.collected.v1 is emitted through the transactional outbox.
 */
export async function processWebhook(
  prisma: PrismaClient,
  input: WebhookInput,
  context: { correlationId: string },
): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({ where: { gatewayRef: input.gatewayRef } });
  if (!payment) return null;

  if (payment.status === 'SUCCESSFUL') {
    // Idempotent: never emit a second collection event for the same payment.
    return payment;
  }

  if (input.status === 'FAILED') {
    return prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESSFUL' },
    });

    const envelope = buildEnvelope({
      eventType: 'payment.collected.v1',
      aggregateType: 'Payment',
      aggregateId: updated.id,
      aggregateVersion: 1,
      concessionId: updated.concessionId,
      assemblyId: updated.assemblyId,
      correlationId: context.correlationId,
      payload: {
        paymentId: updated.id,
        billId: updated.billId,
        amount: Number(updated.amount),
        channel: updated.channel,
        gatewayRef: updated.gatewayRef,
        status: 'SUCCESSFUL',
      },
    });

    await appendOutboxEvent(tx, envelope, 'payment.collected.v1');
    return updated;
  });
}
