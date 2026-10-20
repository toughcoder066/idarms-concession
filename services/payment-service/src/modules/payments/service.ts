import { createHash, randomUUID } from 'node:crypto';
import type { Payment, Prisma, PrismaClient } from '../../../generated/prisma';
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
  | { status: 'created'; response: CheckoutResponse }
  | { status: 'replayed'; response: unknown }
  | { status: 'conflict' };

export interface CheckoutResponse {
  id: string;
  concessionId: string;
  assemblyId: string;
  billId: string;
  amount: number;
  channel: string;
  gatewayRef: string;
  status: string;
  createdAt: string;
}

/**
 * Single response shape used for both the first call and any idempotent replay,
 * so a retried client sees an identical payload.
 */
function toCheckoutResponse(payment: Payment): CheckoutResponse {
  return {
    id: payment.id,
    concessionId: payment.concessionId,
    assemblyId: payment.assemblyId,
    billId: payment.billId,
    amount: Number(payment.amount),
    channel: payment.channel,
    gatewayRef: payment.gatewayRef,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
  };
}

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
    return { status: 'replayed', response: existing.responseBody };
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

    const response = toCheckoutResponse(created);

    await tx.idempotencyRecord.create({
      data: {
        concessionId,
        idempotencyKey,
        requestHash,
        responseStatus: 201,
        responseBody: response as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return created;
  });

  return { status: 'created', response: toCheckoutResponse(payment) };
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
