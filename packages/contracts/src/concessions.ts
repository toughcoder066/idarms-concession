import { z } from 'zod';

export const concessionContractSchema = z.object({
  id: z.string().uuid(),
  concessionCode: z.string(),
  concessionName: z.string(),
  stateRevenueShare: z.number(),
  concessionaireShare: z.number(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const assemblySchema = z.object({
  id: z.string().uuid(),
  assemblyCode: z.string(),
  assemblyName: z.string(),
  region: z.string(),
  croipAssemblyId: z.string().nullable().optional(),
  status: z.enum(['CONFIGURING', 'ACTIVE', 'SUSPENDED']).default('CONFIGURING'),
  prefixRules: z.array(z.string()),
  logoUrl: z.string().nullable().optional(),
  signatureUrl: z.string().nullable().optional(),
  billNotice: z.string().nullable().optional(),
  brandingApprovedByName: z.string().nullable().optional(),
  brandingApprovedAt: z.string().datetime().nullable().optional(),
  adminEmail: z.string().nullable().optional(),
  adminInvitedAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const feeFixingBylawSchema = z.object({
  id: z.string().uuid(),
  assemblyId: z.string().uuid(),
  fiscalYear: z.number().int(),
  propertyTypeId: z.string().uuid(),
  propertyUsageId: z.string().uuid(),
  baseRate: z.number(),
  rateImpost: z.number(),
  minimumLevy: z.number().default(0),
  currency: z.string(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED']).default('DRAFT'),
  version: z.number().int().default(1),
  publishedAt: z.string().datetime().nullable().optional(),
  publishedBy: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const assemblyTargetSchema = z.object({
  id: z.string().uuid(),
  assemblyId: z.string().uuid(),
  fiscalYear: z.number().int(),
  targetAmount: z.number(),
  setBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const approvalRequestSchema = z.object({
  id: z.string().uuid(),
  assemblyId: z.string().uuid(),
  requestType: z.enum(['RATE_MATRIX', 'BILL_ADJUSTMENT', 'WRITE_OFF']),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ESCALATED']),
  requestedBy: z.string(),
  requestedByName: z.string().nullable().optional(),
  requiredRole: z.string(),
  summary: z.string(),
  amount: z.number().nullable().optional(),
  payload: z.record(z.unknown()),
  slaDueAt: z.string().datetime(),
  resolutionNote: z.string().nullable().optional(),
  resolvedBy: z.string().nullable().optional(),
  resolvedByName: z.string().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const agentAssignmentSchema = z.object({
  id: z.string().uuid(),
  assemblyId: z.string().uuid(),
  agentEmail: z.string().email(),
  agentName: z.string(),
  agentSubject: z.string().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  assignedBy: z.string(),
  assignedAt: z.string().datetime(),
});

export type ConcessionContract = z.infer<typeof concessionContractSchema>;
export type Assembly = z.infer<typeof assemblySchema>;
export type FeeFixingBylaw = z.infer<typeof feeFixingBylawSchema>;
export type AssemblyTarget = z.infer<typeof assemblyTargetSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type AgentAssignment = z.infer<typeof agentAssignmentSchema>;
