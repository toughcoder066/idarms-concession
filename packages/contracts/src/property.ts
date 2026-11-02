import { z } from 'zod';

export const propertyTypeSchema = z.enum([
  'UNCLASSIFIED',
  'RESIDENTIAL',
  'COMMERCIAL',
  'INDUSTRIAL',
  'MIXED_USE',
  'GOVERNMENTAL',
  'AGRICULTURAL',
]);

export const propertyUsageSchema = z.enum([
  'GENERAL',
  'SHOP',
  'OFFICE',
  'APARTMENT',
  'SINGLE_FAMILY_HOUSE',
  'WAREHOUSE',
  'FACTORY',
  'HOTEL_LODGING',
  'EDUCATIONAL',
  'FILLING_STATION',
]);

export const propertyStatusSchema = z.enum(['SUBMITTED', 'VERIFIED', 'DISPUTED', 'ARCHIVED']);

export const registrationSourceSchema = z.enum([
  'WALK_IN_DESK',
  'MOBILE_FIELD_APP',
  'BULK_IMPORT',
  'CROIP_SYNC',
]);

export const verificationStateSchema = z.enum(['APPROVED', 'REJECTED', 'NEEDS_CORRECTION']);

export const propertySchema = z.object({
  id: z.string().uuid(),
  croipPropertyId: z.string().uuid().nullable().optional(),
  externalPropertyId: z.string(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  ratepayerRef: z.string().uuid().nullable().optional(),
  digitalAddress: z.string().nullable().optional(),
  zoneCode: z.string().nullable().optional(),
  blockCode: z.string().nullable().optional(),
  addressText: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  propertyType: propertyTypeSchema,
  propertyUsage: propertyUsageSchema,
  ratableValue: z.number().nullable().optional(),
  status: propertyStatusSchema,
  registrationSource: registrationSourceSchema,
  isBillGenerated: z.boolean(),
  documentIds: z.array(z.string().uuid()),
  registeredBy: z.string().uuid(),
  verifiedBy: z.string().uuid().nullable().optional(),
  verifiedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSyncedAt: z.string().datetime().nullable().optional(),
  version: z.number().int(),
});

export const fieldVerificationSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  agentId: z.string().uuid(),
  status: verificationStateSchema,
  notes: z.string().nullable().optional(),
  photoDocumentId: z.string().uuid().nullable().optional(),
  verifiedAt: z.string().datetime(),
});

export type Property = z.infer<typeof propertySchema>;
export type FieldVerification = z.infer<typeof fieldVerificationSchema>;
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type PropertyUsage = z.infer<typeof propertyUsageSchema>;
export type PropertyStatus = z.infer<typeof propertyStatusSchema>;
