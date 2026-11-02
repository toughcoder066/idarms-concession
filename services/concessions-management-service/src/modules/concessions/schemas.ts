import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalEmail = z.string().trim().email().max(254).optional().or(z.literal(''));

export const contractCreateSchema = z.object({
  id: z.string().uuid().optional(),
  concessionCode: z.string().trim().min(2).max(40),
  concessionName: z.string().trim().min(2).max(150),
  stateRevenueShare: z.coerce.number().min(0).max(100),
  concessionaireShare: z.coerce.number().min(0).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().optional(),
});

export const contractUpdateSchema = z.object({
  concessionName: z.string().trim().min(2).max(150).optional(),
  stateRevenueShare: z.coerce.number().min(0).max(100).optional(),
  concessionaireShare: z.coerce.number().min(0).max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

export const assemblyCreateSchema = z.object({
  assemblyCode: z.string().trim().min(2).max(30),
  assemblyName: z.string().trim().min(2).max(150),
  region: z.string().trim().min(2).max(100),
  croipAssemblyId: optionalText(120),
  prefixRules: z.array(z.string().trim().min(1).max(30)).max(50).optional(),
  adminEmail: optionalEmail,
});

export const assemblyUpdateSchema = z.object({
  assemblyName: z.string().trim().min(2).max(150).optional(),
  region: z.string().trim().min(2).max(100).optional(),
  croipAssemblyId: optionalText(120),
  status: z.enum(['CONFIGURING', 'ACTIVE', 'SUSPENDED']).optional(),
  prefixRules: z.array(z.string().trim().min(1).max(30)).max(50).optional(),
  logoUrl: optionalText(2048),
  signatureUrl: optionalText(2048),
  billNotice: optionalText(2000),
  brandingApprovedByName: optionalText(150),
  adminEmail: optionalEmail,
  isActive: z.boolean().optional(),
});

export const assemblyOnboardingSchema = z.object({
  firstAdmin: z.object({
    email: z.string().trim().email().max(254),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
  }).optional(),
});

export type AssemblyOnboardingInput = z.infer<typeof assemblyOnboardingSchema>;

export const rateRowSchema = z.object({
  propertyTypeId: z.string().uuid(),
  propertyUsageId: z.string().uuid(),
  baseRate: z.coerce.number().min(0).max(100_000_000),
  rateImpost: z.coerce.number().min(0).max(1),
  minimumLevy: z.coerce.number().min(0).max(100_000_000).optional(),
});

export const ratesSaveSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(2200),
  rows: z.array(rateRowSchema).min(1).max(500),
});

export const targetSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(2200),
  targetAmount: z.coerce.number().min(0).max(1_000_000_000_000),
});

export const approvalDecisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const agentAssignmentSchema = z.object({
  agentName: z.string().trim().min(2).max(150),
  agentEmail: z.string().trim().email().max(254),
  agentSubject: optionalText(200),
  zoneId: z.string().uuid().optional(),
});

export const submitRatesSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(2200),
  note: z.string().trim().max(1000).optional(),
});

export type ContractCreateInput = z.infer<typeof contractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;
export type AssemblyCreateInput = z.infer<typeof assemblyCreateSchema>;
export type AssemblyUpdateInput = z.infer<typeof assemblyUpdateSchema>;
export type RatesSaveInput = z.infer<typeof ratesSaveSchema>;
export type TargetInput = z.infer<typeof targetSchema>;
export type AgentAssignmentInput = z.infer<typeof agentAssignmentSchema>;

export const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 500 },
    offset: { type: 'integer', minimum: 0 },
    fiscalYear: { type: 'integer', minimum: 2000, maximum: 2200 },
  },
} as const;

export const byIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string' },
  },
} as const;
