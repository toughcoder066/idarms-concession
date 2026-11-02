import { z } from 'zod';

export const spatialZoneSchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  zoneCode: z.string(),
  zoneName: z.string(),
  boundaryCoordinates: z.unknown().nullable().optional(),
  centroidLatitude: z.number().nullable().optional(),
  centroidLongitude: z.number().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const spatialBlockSchema = z.object({
  id: z.string().uuid(),
  concessionId: z.string().uuid(),
  assemblyId: z.string().uuid(),
  zoneId: z.string().uuid(),
  blockCode: z.string(),
  boundaryCoordinates: z.unknown(),
  centroidLatitude: z.number().nullable().optional(),
  centroidLongitude: z.number().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SpatialZone = z.infer<typeof spatialZoneSchema>;
export type SpatialBlock = z.infer<typeof spatialBlockSchema>;
