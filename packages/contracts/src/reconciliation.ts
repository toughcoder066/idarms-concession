import { z } from 'zod';

export const discrepancyReasonSchema = z.enum(['AMOUNT_MISMATCH', 'UNMATCHED_PAYMENT']);

export const discrepancySchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  billId: z.string().uuid(),
  paymentId: z.string().uuid(),
  reason: discrepancyReasonSchema,
  resolved: z.boolean(),
  resolvedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type Discrepancy = z.infer<typeof discrepancySchema>;
export type DiscrepancyReason = z.infer<typeof discrepancyReasonSchema>;
