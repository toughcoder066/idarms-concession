import { idarmsGet, idarmsRequest } from './api';

export interface Contract {
  id: string;
  concessionCode: string;
  concessionName: string;
  stateRevenueShare: number;
  concessionaireShare: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  assemblyCount?: number;
  assemblies?: Array<{ id: string; assemblyCode: string; assemblyName: string; region: string; status: string }>;
}

export interface AssemblySummary {
  id: string;
  assemblyCode: string;
  assemblyName: string;
  region: string;
  croipAssemblyId?: string | null;
  status: string;
  prefixRules: string[];
  logoUrl?: string | null;
  signatureUrl?: string | null;
  billNotice?: string | null;
  brandingApprovedByName?: string | null;
  brandingApprovedAt?: string | null;
  adminEmail?: string | null;
  adminInvitedAt?: string | null;
  contract: Contract | null;
  target: { fiscalYear: number; targetAmount: number } | null;
  rateCount: number;
  publishedRateCount: number;
  pendingRateCount: number;
  agentCount: number;
  totalCombinations: number;
}

export interface AssemblyDetail extends AssemblySummary {
  agentAssignments: AgentAssignment[];
  approvals: ApprovalRequest[];
}

export interface RateRow {
  propertyTypeId: string;
  propertyTypeCode: string;
  propertyTypeName: string;
  propertyUsageId: string;
  propertyUsageCode: string;
  propertyUsageName: string;
  baseRate: number | null;
  rateImpost: number | null;
  minimumLevy: number | null;
  currency: string;
  status: string;
  version: number;
  publishedAt?: string | null;
  previousBaseRate: number | null;
  previousRateImpost: number | null;
  changePct: number | null;
}

export interface RateMatrix {
  assembly: {
    id: string;
    assemblyCode: string;
    assemblyName: string;
    region: string;
    contract: Contract | null;
  };
  fiscalYear: number;
  previousFiscalYear: number;
  rows: RateRow[];
  summary: {
    configured: number;
    total: number;
    pending: number;
    published: number;
    completionPct: number;
    status: string;
    canEdit: boolean;
    averageChangePct: number | null;
    minimumLevyCount: number;
    movers: Array<{ label: string; changePct: number | null; baseRate: number | null; previousBaseRate: number | null }>;
  };
}

export interface ApprovalRequest {
  id: string;
  assemblyId: string;
  requestType: string;
  status: string;
  requestedBy: string;
  requestedByName?: string | null;
  requiredRole: string;
  summary: string;
  amount: number | null;
  payload: { fiscalYear?: number; rowCount?: number; note?: string; requestedAs?: string };
  slaDueAt: string;
  resolutionNote?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: string | null;
  assembly?: { id: string; assemblyCode: string; assemblyName: string };
}

export interface AuditRecord {
  id: string;
  occurredAt: string;
  actorId: string;
  actorType: string;
  assemblyId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: string;
  metadata: { humanReadable?: string } & Record<string, unknown>;
}

export interface AgentAssignment {
  id: string;
  agentName: string;
  agentEmail: string;
  agentSubject?: string | null;
  zoneId?: string | null;
  assignedBy: string;
  assignedAt: string;
}

export interface LookupType {
  id: string;
  code: string;
  name: string;
  usages: Array<{ id: string; code: string; name: string }>;
}

export interface GisZone {
  id: string;
  assemblyId: string;
  zoneCode: string;
  zoneName: string;
  centroidLatitude?: number | null;
  centroidLongitude?: number | null;
  isActive: boolean;
  _count?: { blocks: number };
}

export const currentFiscalYear = () => new Date().getUTCFullYear();

export const getContracts = () => idarmsGet<Contract[]>('concessions', '/contracts');
export const createContract = (body: Record<string, unknown>) =>
  idarmsRequest('concessions', '/contracts', { method: 'POST', body });
export const updateContract = (id: string, body: Record<string, unknown>) =>
  idarmsRequest('concessions', `/contracts/${id}`, { method: 'PATCH', body });
export const getAssemblies = (fiscalYear = currentFiscalYear()) =>
  idarmsGet<AssemblySummary[]>('concessions', `/assemblies?fiscalYear=${fiscalYear}`);
export const getAssembly = (id: string, fiscalYear = currentFiscalYear()) =>
  idarmsGet<AssemblyDetail>('concessions', `/assemblies/${id}?fiscalYear=${fiscalYear}`);
export const getRateMatrix = (id: string, fiscalYear = currentFiscalYear()) =>
  idarmsGet<RateMatrix>('concessions', `/assemblies/${id}/rates?fiscalYear=${fiscalYear}`);
export const getApprovals = (status?: string) =>
  idarmsGet<ApprovalRequest[]>('concessions', `/approvals${status ? `?status=${encodeURIComponent(status)}` : ''}`);
export const getAudit = (limit = 200) => idarmsGet<AuditRecord[]>('concessions', `/audit?limit=${limit}`);
export const getAgents = (assemblyId: string) =>
  idarmsGet<AgentAssignment[]>('concessions', `/assemblies/${assemblyId}/agents`);
export const getLookups = () => idarmsGet<LookupType[]>('concessions', '/lookups');
export const getZones = () => idarmsGet<GisZone[]>('gis', '/zones');

export const createAssembly = (body: Record<string, unknown>) =>
  idarmsRequest('concessions', '/assemblies', { method: 'POST', body });
export const updateAssembly = (id: string, body: Record<string, unknown>) =>
  idarmsRequest('concessions', `/assemblies/${id}`, { method: 'PATCH', body });
export const saveRates = (id: string, body: unknown) =>
  idarmsRequest('concessions', `/assemblies/${id}/rates`, { method: 'PUT', body });
export const submitRates = (id: string, body: { fiscalYear: number; note?: string }) =>
  idarmsRequest('concessions', `/assemblies/${id}/rates/submit`, { method: 'POST', body });
export const approveRequest = (id: string, note?: string) =>
  idarmsRequest('concessions', `/approvals/${id}/approve`, { method: 'POST', body: { note } });
export const rejectRequest = (id: string, note?: string) =>
  idarmsRequest('concessions', `/approvals/${id}/reject`, { method: 'POST', body: { note } });
export const saveTarget = (id: string, body: { fiscalYear: number; targetAmount: number }) =>
  idarmsRequest('concessions', `/assemblies/${id}/target`, { method: 'PUT', body });
export const assignAgent = (id: string, body: Record<string, unknown>) =>
  idarmsRequest('concessions', `/assemblies/${id}/agents`, { method: 'POST', body });
export const removeAgent = (id: string, agentId: string) =>
  idarmsRequest('concessions', `/assemblies/${id}/agents/${agentId}`, { method: 'DELETE' });
export const createZone = (body: Record<string, unknown>) =>
  idarmsRequest('gis', '/zones', { method: 'POST', body });
