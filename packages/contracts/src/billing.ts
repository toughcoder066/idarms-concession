import { z } from 'zod';

export const billStatusSchema = z.enum([
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
]);

export const billSchema = z.object({
  id: z.string().uuid(),
  billNumber: z.string(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  propertyId: z.string().uuid(),
  fiscalYear: z.number().int(),
  ratableValue: z.number(),
  baseRate: z.number(),
  rateImpost: z.number(),
  subTotal: z.number(),
  penaltyAmount: z.number(),
  discountAmount: z.number(),
  totalAmount: z.number(),
  amountPaid: z.number(),
  currency: z.string(),
  status: billStatusSchema,
  issuedAt: z.string().datetime(),
  dueDate: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Bill = z.infer<typeof billSchema>;
export type BillStatus = z.infer<typeof billStatusSchema>;
