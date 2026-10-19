import { z } from 'zod';

export const propertySchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  reference: z.string(),
  ratepayerId: z.string().uuid(),
  propertyType: z.string(),
  gpsCoordinates: z.string().nullable().optional(),
  status: z.enum(['PENDING_VERIFICATION', 'VERIFIED']),
  lastSyncedAt: z.string().datetime(),
});

export const fieldVerificationSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  agentId: z.string().uuid(),
  status: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  verifiedAt: z.string().datetime(),
});

export type Property = z.infer<typeof propertySchema>;
export type FieldVerification = z.infer<typeof fieldVerificationSchema>;
