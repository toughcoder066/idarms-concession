import { z } from 'zod';

export const valuationSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  marketValue: z.number(),
  taxableValue: z.number(),
  fiscalYear: z.number().int(),
  createdAt: z.string().datetime(),
});

export type Valuation = z.infer<typeof valuationSchema>;
