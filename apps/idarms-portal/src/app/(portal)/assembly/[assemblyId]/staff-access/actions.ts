'use server';

import { revalidatePath } from 'next/cache';
import { idarmsRequest, type IdarmsResponse } from '@/lib/api';
import type {
  BulkImportCommitResult,
  BulkImportValidation,
  StaffMember,
} from '@/lib/staff';

function revalidateStaff(assemblyId: string): void {
  revalidatePath(`/assembly/${assemblyId}/staff-access`);
  revalidatePath('/concession/access-directory');
}

export async function inviteStaffAction(
  assemblyId: string,
  input: { name: string; email: string; phone?: string; role: string },
): Promise<IdarmsResponse<{
  userId: string;
  email: string;
  role: string;
  inviteStatus: string;
  notifiedAssemblyAdmin: boolean;
}>> {
  const result = await idarmsRequest<{
    userId: string;
    email: string;
    role: string;
    inviteStatus: string;
    notifiedAssemblyAdmin: boolean;
  }>('concessions', `/assemblies/${assemblyId}/staff/invite`, {
    method: 'POST',
    body: input,
  });
  if (result.ok) revalidateStaff(assemblyId);
  return result;
}

export async function validateBulkImportAction(
  assemblyId: string,
  csv: string,
): Promise<IdarmsResponse<BulkImportValidation>> {
  return idarmsRequest('concessions', `/assemblies/${assemblyId}/staff/bulk-import/validate`, {
    method: 'POST',
    body: { csv },
  });
}

export async function commitBulkImportAction(
  assemblyId: string,
  batchId: string,
): Promise<IdarmsResponse<BulkImportCommitResult>> {
  const result = await idarmsRequest<BulkImportCommitResult>('concessions', `/assemblies/${assemblyId}/staff/bulk-import/commit`, {
    method: 'POST',
    body: { batchId },
  });
  if (result.ok) revalidateStaff(assemblyId);
  return result;
}

export async function updateStaffRoleAction(
  assemblyId: string,
  userId: string,
  role: string,
): Promise<IdarmsResponse<{
  userId: string;
  oldRole: string;
  newRole: string;
  changed: boolean;
  notifiedAssemblyAdmin: boolean;
}>> {
  const result = await idarmsRequest<{
    userId: string;
    oldRole: string;
    newRole: string;
    changed: boolean;
    notifiedAssemblyAdmin: boolean;
  }>('concessions', `/assemblies/${assemblyId}/staff/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { role },
  });
  if (result.ok) revalidateStaff(assemblyId);
  return result;
}

export async function setStaffStateAction(
  assemblyId: string,
  userId: string,
  action: 'deactivate' | 'reactivate',
): Promise<IdarmsResponse<{
  userId: string;
  status: string;
  revokedSessions: number;
  notifiedAssemblyAdmin: boolean;
}>> {
  const result = await idarmsRequest<{
    userId: string;
    status: string;
    revokedSessions: number;
    notifiedAssemblyAdmin: boolean;
  }>('concessions', `/assemblies/${assemblyId}/staff/${encodeURIComponent(userId)}/${action}`, {
    method: 'POST',
    body: {},
  });
  if (result.ok) revalidateStaff(assemblyId);
  return result;
}

export async function resendStaffInviteAction(
  assemblyId: string,
  userId: string,
): Promise<IdarmsResponse<{
  userId: string;
  status: string;
  notifiedAssemblyAdmin: boolean;
}>> {
  const result = await idarmsRequest<{
    userId: string;
    status: string;
    notifiedAssemblyAdmin: boolean;
  }>('concessions', `/assemblies/${assemblyId}/staff/${encodeURIComponent(userId)}/resend-invite`, {
    method: 'POST',
    body: {},
  });
  if (result.ok) revalidateStaff(assemblyId);
  return result;
}

export async function loadStaffAction(
  assemblyId: string,
): Promise<IdarmsResponse<StaffMember[]>> {
  return idarmsRequest('concessions', `/assemblies/${assemblyId}/staff`);
}
