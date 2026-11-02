import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real calendar date');

const polygon = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.unknown()).min(1),
}).passthrough();

/**
 * One assembly as CROIP knows it: identity from shared-services MunicipalAssembly,
 * contract dates from platform-governance ConcessionAssembly.
 */
const assignedAssemblyEntry = z.object({
  assemblyId: z.string().uuid(),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(20).optional(),
  regionId: z.string().uuid().optional(),
  contractStart: isoDate.optional(),
  contractEnd: isoDate,
  polygonGeoJson: polygon.optional(),
}).strict().refine(
  (entry) => !entry.contractStart || entry.contractStart <= entry.contractEnd,
  { message: 'contractStart must not be after contractEnd', path: ['contractEnd'] },
);

/** The full current list of this concession's assigned assemblies. */
export const assignedAssemblyFileSchema = z.object({
  concessionId: z.string().uuid(),
  assemblies: z.array(assignedAssemblyEntry).min(1, 'At least one assembly is required; an empty list would remove them all'),
}).strict().superRefine((file, ctx) => {
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  file.assemblies.forEach((entry, index) => {
    if (seenIds.has(entry.assemblyId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate assemblyId', path: ['assemblies', index, 'assemblyId'] });
    }
    if (seenCodes.has(entry.code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate assembly code', path: ['assemblies', index, 'code'] });
    }
    seenIds.add(entry.assemblyId);
    seenCodes.add(entry.code);
  });
});

export type AssignedAssemblyFile = z.infer<typeof assignedAssemblyFileSchema>;
export type AssignedAssemblyEntry = AssignedAssemblyFile['assemblies'][number];

export const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    includeRemoved: { type: 'boolean' },
  },
} as const;
