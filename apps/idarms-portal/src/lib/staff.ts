export interface StaffMember {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  roles: string[];
  status: 'invited' | 'active' | 'deactivated' | 'unknown';
  lastLoginAt: string | null;
  invitedAt: string | null;
  invitedBy: string | null;
}

export interface AccessDirectoryEntry {
  orgId: string;
  assemblyId: string;
  assemblyName: string | null;
  assemblyCode: string | null;
  concessionId: string;
  primaryDomain: string | null;
  role: 'CONCESSION_SUPER_ADMIN';
}

export interface StaffNotification {
  id: string;
  assemblyId: string;
  concessionId: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetUserId: string | null;
  targetRole: string | null;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export type PreviewStatus =
  | 'Valid'
  | 'Warning'
  | 'Duplicate'
  | 'Invalid role'
  | 'Invalid — assembly mismatch'
  | 'Error';

export type CommitStatus =
  | 'Invited'
  | 'Already exists'
  | 'Failed – retry available'
  | 'Needs review';

export interface BulkImportPreviewRow {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  assemblyCode: string;
  orgId: string;
  status: PreviewStatus;
  message?: string;
}

export interface BulkImportCommitRow {
  rowNumber: number;
  name: string;
  email: string;
  role: string;
  status: CommitStatus;
  message?: string;
  userId?: string;
}

export interface BulkImportValidation {
  batchId: string;
  assemblyId: string;
  summary: {
    total: number;
    valid: number;
    warning: number;
    duplicate: number;
    invalidRole: number;
    assemblyMismatch: number;
    error: number;
  };
  rows: BulkImportPreviewRow[];
}

export interface BulkImportCommitResult {
  batchId: string;
  status: 'COMMITTED';
  summary: {
    total: number;
    invited: number;
    alreadyExists: number;
    failed: number;
    needsReview: number;
  };
  rows: BulkImportCommitRow[];
}

export interface BulkImportBatchDetail {
  batchId: string;
  assemblyId: string;
  status: string;
  rows: BulkImportPreviewRow[] | null;
  results: BulkImportCommitRow[] | null;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
  committedAt: string | null;
}

export interface StaffRoleOption {
  key: string;
  label: string;
}

export interface StaffActionError {
  ok: false;
  status: number;
  code?: string;
  message?: string;
}

export function staffErrorMessage(code?: string, fallback?: string): string {
  switch (code) {
    case 'role_forbidden':
      return 'Your role does not allow this action.';
    case 'target_forbidden':
      return 'This user is above your staff-management ceiling.';
    case 'org_forbidden':
      return 'You do not have access to this assembly.';
    case 'concession_forbidden':
      return 'This assembly is outside your concession.';
    case 'last_assembly_admin':
      return 'Cannot deactivate the last active Assembly Admin for this assembly.';
    case 'self_deactivation':
      return 'You cannot deactivate your own account.';
    case 'assembly_not_provisioned':
      return 'This assembly has not finished ZITADEL onboarding yet.';
    case 'assembly_not_found':
      return 'This assembly could not be found.';
    case 'not_invited':
      return 'An invitation can only be resent while the user is in the invited state.';
    case 'already_active':
      return 'This staff member is already active.';
    case 'not_deactivated':
      return 'Only a deactivated staff member can be reactivated.';
    case 'not_active':
      return 'Only an active staff member can be deactivated.';
    case 'role_conflict':
      return 'This user already has a different iDARMS role. Use Edit role instead.';
    case 'provisioning_not_configured':
      return 'Local ZITADEL provisioning is not configured for this service.';
    default:
      return fallback || 'The staff operation could not be completed.';
  }
}

export function displayRole(key: string | null | undefined): string {
  if (!key) return '—';
  return key
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
