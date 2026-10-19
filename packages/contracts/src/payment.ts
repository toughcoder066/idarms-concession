import { z } from 'zod';

export const paymentSchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  billId: z.string().uuid(),
  amount: z.number(),
  channel: z.enum(['MOMO', 'CARD']),
  gatewayRef: z.string(),
  status: z.enum(['PENDING', 'SUCCESSFUL', 'FAILED']),
  createdAt: z.string().datetime(),
});

export type Payment = z.infer<typeof paymentSchema>;
