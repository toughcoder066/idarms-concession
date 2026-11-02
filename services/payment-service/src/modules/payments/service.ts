import { createHash, randomUUID } from 'node:crypto';
import type { PaymentTransaction, Prisma, PrismaClient } from '../../../generated/prisma';
import { appendOutboxEvent } from '../../messaging/outbox';
import { buildEnvelope } from '../../messaging/events';

export interface TenantScope {
  concessionId?: string;
  assemblyId?: string;
}

export async function list(prisma: PrismaClient, scope: TenantScope) {
  return prisma.paymentTransaction.findMany({
    where: { concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}

export async function getById(prisma: PrismaClient, id: string, scope: TenantScope) {
  return prisma.paymentTransaction.findFirst({
    where: { id, concessionId: scope.concessionId, assemblyId: scope.assemblyId },
  });
}

export type PaymentChannelInput =
  | 'MOBILE_MONEY'
  | 'BANK_CARD'
  | 'POS_TERMINAL'
  | 'CASH_DESK'
  | 'MOMO'
  | 'CARD';

export interface CheckoutInput {
  billId: string;
  amount: number;
  channel: PaymentChannelInput;
  propertyId?: string;
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
  propertyId: string;
  amount: number;
  currency: string;
  channel: string;
  provider: string;
  reference: string;
  externalReference: string | null;
  /** @deprecated use externalReference; kept for existing clients */
  gatewayRef: string;
  status: string;
  createdAt: string;
}

function normalizeChannel(channel: PaymentChannelInput): 'MOBILE_MONEY' | 'BANK_CARD' | 'POS_TERMINAL' | 'CASH_DESK' {
  if (channel === 'MOMO') return 'MOBILE_MONEY';
  if (channel === 'CARD') return 'BANK_CARD';
  return channel;
}

/**
 * Single response shape used for both the first call and any idempotent replay,
 * so a retried client sees an identical payload.
 */
function toCheckoutResponse(payment: PaymentTransaction): CheckoutResponse {
  return {
    id: payment.id,
    concessionId: payment.concessionId,
    assemblyId: payment.assemblyId,
    billId: payment.billId,
    propertyId: payment.propertyId,
    amount: Number(payment.amount),
    currency: payment.currency,
    channel: payment.channel,
    provider: payment.provider,
    reference: payment.reference,
    externalReference: payment.externalReference,
    gatewayRef: payment.externalReference ?? payment.reference,
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

  // The bill replica is usually delivered before checkout, but a client may
  // race the bill.issued.v1 consumer. Accept the propertyId from the request as
  // a fallback so a valid billId is never rejected.
  const bill = await prisma.billReplica.findUnique({ where: { id: input.billId } });
  const propertyId = bill?.propertyId ?? input.propertyId ?? '00000000-0000-0000-0000-000000000000';
  const currency = bill?.currency ?? 'GHS';

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.paymentTransaction.create({
      data: {
        reference: `PAY-${randomUUID()}`,
        externalReference: `GW-${randomUUID()}`,
        concessionId,
        assemblyId,
        billId: input.billId,
        propertyId,
        amount: input.amount,
        currency,
        channel: normalizeChannel(input.channel),
        provider: 'PAYSTACK',
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
  gatewayRef?: string;
  reference?: string;
  status: 'SUCCESS' | 'SUCCESSFUL' | 'FAILED';
  amount?: number;
}

/**
 * Gateway callback. On success the payment is finalised, the bill replica is
 * updated, and payment.collected.v1 is emitted through the transactional outbox.
 */
export async function processWebhook(
  prisma: PrismaClient,
  input: WebhookInput,
  context: { correlationId: string },
): Promise<PaymentTransaction | null> {
  const reference = input.gatewayRef ?? input.reference;
  if (!reference) return null;

  const payment = await prisma.paymentTransaction.findFirst({
    where: { OR: [{ reference }, { externalReference: reference }] },
  });
  if (!payment) return null;

  if (payment.status === 'SUCCESS') {
    // Idempotent: never emit a second collection event for the same payment.
    return payment;
  }

  if (input.status === 'FAILED') {
    return prisma.paymentTransaction.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: 'GATEWAY_REJECTED' },
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        paidAt: new Date(),
        externalReference: payment.externalReference ?? reference,
      },
    });

    const bill = await tx.billReplica.findUnique({ where: { id: updated.billId } });
    if (bill) {
      const amountPaid = Number(bill.amountPaid) + Number(updated.amount);
      await tx.billReplica.update({
        where: { id: bill.id },
        data: {
          amountPaid,
          status: amountPaid >= Number(bill.totalAmount) ? 'PAID' : 'PARTIALLY_PAID',
        },
      });
    }

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
        propertyId: updated.propertyId,
        amount: Number(updated.amount),
        currency: updated.currency,
        channel: updated.channel,
        provider: updated.provider,
        reference: updated.reference,
        externalReference: updated.externalReference,
        gatewayRef: updated.externalReference ?? updated.reference,
        status: 'SUCCESS',
        paidAt: updated.paidAt?.toISOString(),
      },
    });

    await appendOutboxEvent(tx, envelope, 'payment.collected.v1');
    return updated;
  });
}
