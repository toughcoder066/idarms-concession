'use server';

import { revalidatePath } from 'next/cache';
import {
  approveRequest,
  assignAgent,
  createAssembly,
  createContract,
  createZone,
  rejectRequest,
  removeAgent,
  saveRates,
  saveTarget,
  submitRates,
  updateAssembly,
  updateContract,
} from '@/lib/concessions';
import { getConcessionAccess } from '@/lib/access';

export interface ActionResult {
  ok: boolean;
  message: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function createContractAction(formData: FormData): Promise<ActionResult> {
  try {
    const access = await getConcessionAccess();
    const result = await createContract({
      id: access.concessionId,
      concessionCode: text(formData, 'concessionCode'),
      concessionName: text(formData, 'concessionName'),
      stateRevenueShare: Number(text(formData, 'stateRevenueShare') || 40),
      concessionaireShare: Number(text(formData, 'concessionaireShare') || 60),
      startDate: text(formData, 'startDate'),
      endDate: text(formData, 'endDate'),
      isActive: true,
    });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to create the contract.' };
    revalidatePath('/concessions');
    revalidatePath('/concessions/contracts');
    revalidatePath('/concessions/assemblies');
    return { ok: true, message: 'Concession contract created.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function updateContractAction(formData: FormData): Promise<ActionResult> {
  try {
    const access = await getConcessionAccess();
    const result = await updateContract(access.concessionId ?? '', {
      concessionName: text(formData, 'concessionName'),
      stateRevenueShare: Number(text(formData, 'stateRevenueShare')),
      concessionaireShare: Number(text(formData, 'concessionaireShare')),
      startDate: text(formData, 'startDate'),
      endDate: text(formData, 'endDate'),
      isActive: text(formData, 'isActive') === 'true',
    });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to update the contract.' };
    revalidatePath('/concessions');
    revalidatePath('/concessions/contracts');
    return { ok: true, message: 'Contract terms saved.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function createAssemblyAction(formData: FormData): Promise<ActionResult> {  try {
    const result = await createAssembly({
      assemblyCode: text(formData, 'assemblyCode'),
      assemblyName: text(formData, 'assemblyName'),
      region: text(formData, 'region'),
      croipAssemblyId: text(formData, 'croipAssemblyId'),
      adminEmail: text(formData, 'adminEmail'),
      prefixRules: text(formData, 'prefixRules')
        .split(',')
        .map((rule) => rule.trim())
        .filter(Boolean),
    });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to onboard the assembly.' };
    revalidatePath('/concessions');
    revalidatePath('/concessions/assemblies');
    const assembly = result.data as { id?: string } | undefined;
    if (assembly?.id) revalidatePath(`/concessions/assemblies/${assembly.id}`);
    return { ok: true, message: 'Assembly onboarded. Continue with the readiness checklist.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function updateAssemblyAction(assemblyId: string, formData: FormData): Promise<ActionResult> {
  try {
    const result = await updateAssembly(assemblyId, {
      assemblyName: text(formData, 'assemblyName'),
      region: text(formData, 'region'),
      croipAssemblyId: text(formData, 'croipAssemblyId'),
      logoUrl: text(formData, 'logoUrl'),
      signatureUrl: text(formData, 'signatureUrl'),
      billNotice: text(formData, 'billNotice'),
      brandingApprovedByName: text(formData, 'brandingApprovedByName'),
      adminEmail: text(formData, 'adminEmail'),
      status: text(formData, 'status') || undefined,
      prefixRules: text(formData, 'prefixRules')
        .split(',')
        .map((rule) => rule.trim())
        .filter(Boolean),
    });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to update the assembly.' };
    revalidatePath('/concessions');
    revalidatePath('/concessions/assemblies');
    revalidatePath(`/concessions/assemblies/${assemblyId}`);
    return { ok: true, message: 'Assembly details saved.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function saveRatesAction(input: {
  assemblyId: string;
  fiscalYear: number;
  rows: Array<{ propertyTypeId: string; propertyUsageId: string; baseRate: number; rateImpost: number; minimumLevy: number }>;
}): Promise<ActionResult> {
  try {
    const result = await saveRates(input.assemblyId, { fiscalYear: input.fiscalYear, rows: input.rows });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to save the rate matrix.' };
    revalidatePath('/concessions/rates');
    revalidatePath(`/concessions/assemblies/${input.assemblyId}`);
    revalidatePath('/concessions/audit');
    return { ok: true, message: `Saved ${input.rows.length} rate rows as a draft.` };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function submitRatesAction(input: {
  assemblyId: string;
  fiscalYear: number;
  note?: string;
}): Promise<ActionResult> {
  try {
    const result = await submitRates(input.assemblyId, { fiscalYear: input.fiscalYear, note: input.note });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to submit the rate matrix.' };
    revalidatePath('/concessions/rates');
    revalidatePath('/concessions/approvals');
    revalidatePath('/concessions/audit');
    revalidatePath(`/concessions/assemblies/${input.assemblyId}`);
    return { ok: true, message: 'Rate matrix submitted for Assembly approval.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function approveAction(approvalId: string, note?: string): Promise<ActionResult> {
  try {
    const result = await approveRequest(approvalId, note);
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to approve the request.' };
    revalidatePath('/concessions/approvals');
    revalidatePath('/concessions/rates');
    revalidatePath('/concessions/audit');
    revalidatePath('/concessions');
    return { ok: true, message: 'Approved. Published rates are now available to billing.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function rejectAction(approvalId: string, note?: string): Promise<ActionResult> {
  try {
    const result = await rejectRequest(approvalId, note);
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to reject the request.' };
    revalidatePath('/concessions/approvals');
    revalidatePath('/concessions/rates');
    revalidatePath('/concessions/audit');
    return { ok: true, message: 'Request rejected and returned to draft.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function saveTargetAction(input: {
  assemblyId: string;
  fiscalYear: number;
  targetAmount: number;
}): Promise<ActionResult> {
  try {
    const result = await saveTarget(input.assemblyId, { fiscalYear: input.fiscalYear, targetAmount: input.targetAmount });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to save the target.' };
    revalidatePath('/concessions/targets');
    revalidatePath(`/concessions/assemblies/${input.assemblyId}`);
    revalidatePath('/concessions/audit');
    return { ok: true, message: 'Revenue target saved.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function assignAgentAction(input: {
  assemblyId: string;
  agentName: string;
  agentEmail: string;
  zoneId?: string;
}): Promise<ActionResult> {
  try {
    const result = await assignAgent(input.assemblyId, {
      agentName: input.agentName,
      agentEmail: input.agentEmail,
      zoneId: input.zoneId || undefined,
    });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to assign the agent.' };
    revalidatePath('/concessions/zones');
    revalidatePath(`/concessions/assemblies/${input.assemblyId}`);
    revalidatePath('/concessions/audit');
    return { ok: true, message: 'Agent assignment saved.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function removeAgentAction(input: { assemblyId: string; agentId: string }): Promise<ActionResult> {
  try {
    const result = await removeAgent(input.assemblyId, input.agentId);
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to remove the agent.' };
    revalidatePath('/concessions/zones');
    revalidatePath(`/concessions/assemblies/${input.assemblyId}`);
    return { ok: true, message: 'Agent removed from the assembly.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function createZoneAction(input: {
  assemblyId: string;
  zoneCode: string;
  zoneName: string;
}): Promise<ActionResult> {
  try {
    const result = await createZone({
      assemblyId: input.assemblyId,
      zoneCode: input.zoneCode,
      zoneName: input.zoneName,
    });
    if (!result.ok) return { ok: false, message: result.message ?? 'Unable to create the zone.' };
    revalidatePath('/concessions/zones');
    revalidatePath('/gis');
    return { ok: true, message: 'Zone created. Add blocks as boundary data becomes available.' };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}
