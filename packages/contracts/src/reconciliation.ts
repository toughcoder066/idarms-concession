import { z } from 'zod';

export const discrepancySchema = z.object({
  id: z.string().uuid(),
  billId: z.string().uuid(),
  paymentId: z.string().uuid(),
  reason: z.enum(['AMOUNT_MISMATCH', 'UNMATCHED_PAYMENT']),
  resolved: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export type Discrepancy = z.infer<typeof discrepancySchema>;
