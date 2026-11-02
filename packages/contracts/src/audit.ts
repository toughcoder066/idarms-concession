import { getRoleDefinition } from './roles';

export type AuditActorKind = 'SUPER_ADMIN' | 'ASSEMBLY' | 'UNKNOWN';

export interface AuditDescriptionSource {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  assemblyName?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditActionFilterOption {
  value: string;
  label: string;
  prefix?: boolean;
}

/**
 * Shared action vocabulary for the Activity & Audit and Audit Ledger screens.
 * Prefix filters keep bulk-import/onboarding sub-steps grouped in the UI.
 */
export const AUDIT_ACTION_FILTERS: readonly AuditActionFilterOption[] = [
  { value: 'staff.invited', label: 'Staff invited' },
  { value: 'staff.role_changed', label: 'Role changed' },
  { value: 'staff.deactivated', label: 'Staff deactivated' },
  { value: 'staff.reactivated', label: 'Staff reactivated' },
  { value: 'staff.invite_resent', label: 'Invite resent' },
  { value: 'staff.bulk_import', label: 'Bulk import', prefix: true },
  { value: 'assembly.onboarding', label: 'Assembly onboarding', prefix: true },
  { value: 'security.request_denied', label: 'Access denied' },
];

const ACTION_LABELS: Record<string, string> = {
  'staff.invited': 'Staff invited',
  'staff.role_changed': 'Role changed',
  'staff.deactivated': 'Staff deactivated',
  'staff.reactivated': 'Staff reactivated',
  'staff.invite_resent': 'Invite resent',
  'staff.bulk_import.validated': 'Bulk import validated',
  'staff.bulk_import.committed': 'Bulk import committed',
  'staff.bulk_import.user_invited': 'Bulk import user invited',
  'assembly.onboarding.started': 'Onboarding started',
  'assembly.onboarding.org.created': 'Organization created',
  'assembly.onboarding.project.granted': 'Project granted',
  'assembly.onboarding.super_admins.granted': 'Super Admins granted',
  'assembly.onboarding.admin.invited': 'First Assembly Admin invited',
  'assembly.onboarding.registry.written': 'Org registry written',
  'assembly.onboarding.completed': 'Onboarding completed',
  'assembly.onboarding.failed': 'Onboarding failed',
  'assembly.onboarding.rolled_back': 'Onboarding rolled back',
  'security.request_denied': 'Access denied',
};

export function auditActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith('staff.bulk_import.')) return 'Bulk import';
  if (action.startsWith('assembly.onboarding.')) return 'Assembly onboarding';
  return action
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function auditActorKind(actorRole: string | null | undefined): AuditActorKind {
  if (actorRole === 'CONCESSION_SUPER_ADMIN' || actorRole === 'PLATFORM_ADMIN') {
    return 'SUPER_ADMIN';
  }
  if (actorRole && actorRole !== 'UNKNOWN') return 'ASSEMBLY';
  return 'UNKNOWN';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function roleLabel(value: unknown): string {
  const role = text(value);
  if (!role) return 'staff';
  return getRoleDefinition(role)?.displayName
    ?? role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function assemblySuffix(entry: AuditDescriptionSource): string {
  return entry.assemblyName ? ` in ${entry.assemblyName}` : '';
}

function targetEmail(entry: AuditDescriptionSource, metadata: Record<string, unknown>): string {
  return text(metadata.email)
    ?? text(metadata.targetEmail)
    ?? text(metadata.userName)
    ?? entry.resourceId
    ?? 'the user';
}

/**
 * Reconstructs the human sentence from structured audit fields. The stored
 * humanReadable string is only a fallback for actions this shared formatter
 * does not know about; filtering never depends on these strings.
 */
export function formatAuditDescription(entry: AuditDescriptionSource): string {
  const metadata = entry.metadata ?? {};
  const email = targetEmail(entry, metadata);
  const suffix = assemblySuffix(entry);
  const summary = metadata.summary && typeof metadata.summary === 'object'
    ? metadata.summary as Record<string, unknown>
    : {};

  switch (entry.action) {
    case 'staff.invited': {
      const invited = metadata.inviteStatus === 'INVITED';
      return invited
        ? `Invited ${email} as ${roleLabel(metadata.role)}${suffix}.`
        : `Granted ${email} the ${roleLabel(metadata.role)} role${suffix}.`;
    }
    case 'staff.role_changed':
      return `Changed ${email}'s role from ${roleLabel(metadata.oldRole)} to ${roleLabel(metadata.newRole)}${suffix}.`;
    case 'staff.deactivated':
      return `Deactivated ${email}${suffix}.`;
    case 'staff.reactivated':
      return `Reactivated ${email}${suffix}.`;
    case 'staff.invite_resent':
      return `Resent the invitation for ${email}${suffix}.`;
    case 'staff.bulk_import.validated':
      return `Validated a ${count(summary.total) || count(metadata.rowCount)}-row staff import${suffix}.`;
    case 'staff.bulk_import.committed':
      return `Committed a ${count(summary.total)}-row staff import (${count(summary.invited)} invited, ${count(summary.alreadyExists)} already existed, ${count(summary.failed)} failed, ${count(summary.needsReview)} need review)${suffix}.`;
    case 'staff.bulk_import.user_invited':
      return `Bulk-imported ${email} as ${roleLabel(metadata.role)}${suffix}.`;
    case 'assembly.onboarding.started':
      return `Started onboarding ${entry.assemblyName ?? 'the assembly'}.`;
    case 'assembly.onboarding.org.created':
      return `Created the ZITADEL organization for ${entry.assemblyName ?? 'the assembly'}${entry.resourceId ? ` (${entry.resourceId})` : ''}.`;
    case 'assembly.onboarding.project.granted':
      return `Granted the iDARMS project to ${entry.assemblyName ?? 'the assembly'}.`;
    case 'assembly.onboarding.super_admins.granted':
      return `Granted CONCESSION_SUPER_ADMIN to ${count(metadata.count)} existing super admin(s) in ${entry.assemblyName ?? 'the assembly'}.`;
    case 'assembly.onboarding.admin.invited':
      return `Invited the first Assembly Admin${text(metadata.email) ? ` (${text(metadata.email)})` : ''} for ${entry.assemblyName ?? 'the assembly'}.`;
    case 'assembly.onboarding.registry.written':
      return `Registered the ZITADEL organization for ${entry.assemblyName ?? 'the assembly'}.`;
    case 'assembly.onboarding.completed':
      return `Completed onboarding for ${entry.assemblyName ?? 'the assembly'}.`;
    case 'security.request_denied': {
      const method = text(metadata.method) ?? 'request';
      const path = text(metadata.path) ?? 'a protected endpoint';
      const code = text(metadata.code) ?? 'forbidden';
      return `Denied ${method} ${path} (${code})${suffix}.`;
    }
    default: {
      const stored = text(metadata.humanReadable);
      if (stored) return stored;
      const resource = entry.resourceId ? ` (${entry.resourceId})` : '';
      return `${auditActionLabel(entry.action)}${resource}.`;
    }
  }
}
