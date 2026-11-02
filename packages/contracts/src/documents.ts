import { z } from 'zod';

export const entityTypeSchema = z.enum(['PROPERTY', 'RATEPAYER', 'BILL', 'PAYMENT']);
export const uploadStatusSchema = z.enum(['PENDING_UPLOAD', 'UPLOADED', 'FAILED', 'DELETED']);

export const documentSchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  documentType: z.string(),
  storageProvider: z.string(),
  storageKey: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().int().nullable().optional(),
  checksum: z.string().nullable().optional(),
  uploadStatus: uploadStatusSchema,
  uploadedBy: z.string().uuid().nullable().optional(),
  uploadedAt: z.string().datetime().nullable().optional(),
  metadata: z.unknown().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type DocumentRecord = z.infer<typeof documentSchema>;
