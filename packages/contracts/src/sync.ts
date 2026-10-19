import { z } from 'zod';

export const syncRecordSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(['PROPERTY', 'PAYMENT', 'RATEPAYER']),
  entityId: z.string().uuid(),
  direction: z.enum(['UPSTREAM', 'DOWNSTREAM']),
  status: z.enum(['SYNCED', 'FAILED']),
  croipReference: z.string().nullable().optional(),
  lastSyncedAt: z.string().datetime(),
});

export type SyncRecord = z.infer<typeof syncRecordSchema>;
