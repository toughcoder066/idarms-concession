import { z } from 'zod';

export const paymentChannelSchema = z.enum([
  'MOBILE_MONEY',
  'BANK_CARD',
  'POS_TERMINAL',
  'CASH_DESK',
]);

export const paymentStatusSchema = z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REVERSED']);

export const paymentSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  externalReference: z.string().nullable().optional(),
  billId: z.string().uuid(),
  propertyId: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  amount: z.number(),
  currency: z.string(),
  channel: paymentChannelSchema,
  provider: z.string(),
  status: paymentStatusSchema,
  payerPhone: z.string().nullable().optional(),
  payerEmail: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Payment = z.infer<typeof paymentSchema>;
export type PaymentChannel = z.infer<typeof paymentChannelSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
