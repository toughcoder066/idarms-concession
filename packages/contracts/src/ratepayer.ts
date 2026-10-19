import { z } from 'zod';

export const ratepayerSchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  reference: z.string(),
  fullName: z.string(),
  ghanaCardId: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  status: z.string(),
  lastSyncedAt: z.string().datetime(),
});

export type Ratepayer = z.infer<typeof ratepayerSchema>;
