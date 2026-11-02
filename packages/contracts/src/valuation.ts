import { z } from 'zod';

export const valuationSchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  propertyId: z.string().uuid(),
  propertyType: z.string(),
  propertyUsage: z.string(),
  marketValue: z.number(),
  taxableValue: z.number(),
  fiscalYear: z.number().int(),
  basis: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Valuation = z.infer<typeof valuationSchema>;
