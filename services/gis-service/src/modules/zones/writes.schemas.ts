import { z } from 'zod';

export const zoneCreateSchema = z.object({
  assemblyId: z.string().uuid().optional(),
  zoneCode: z.string().trim().min(1).max(30),
  zoneName: z.string().trim().min(2).max(120),
  boundaryCoordinates: z.unknown().optional(),
  centroidLatitude: z.coerce.number().min(-90).max(90).optional(),
  centroidLongitude: z.coerce.number().min(-180).max(180).optional(),
});

export const blockCreateSchema = z.object({
  blockCode: z.string().trim().min(1).max(30),
  boundaryCoordinates: z.unknown(),
  centroidLatitude: z.coerce.number().min(-90).max(90).optional(),
  centroidLongitude: z.coerce.number().min(-180).max(180).optional(),
});
