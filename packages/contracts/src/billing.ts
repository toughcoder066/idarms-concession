import { z } from 'zod';

export const billSchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  billNumber: z.string(),
  propertyId: z.string().uuid(),
  amountDue: z.number(),
  amountPaid: z.number().default(0),
  status: z.enum(['DRAFT', 'ISSUED', 'PAID']),
  fiscalYear: z.number().int(),
  createdAt: z.string().datetime(),
});

export type Bill = z.infer<typeof billSchema>;
