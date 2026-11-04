export interface AuditEntry {
  id: string;
  occurredAt: string;
  actorId: string;
  actorName: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  action: string;
  actionLabel: string;
  resourceType: string;
  resourceId: string | null;
  assemblyId: string | null;
  assemblyName: string | null;
  assemblyCode: string | null;
  outcome: string;
  description: string;
  batchId: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AuditActorOption {
  actorId: string;
  name: string | null;
  role: string | null;
  email: string | null;
  actionCount: number;
  lastActionAt: string | null;
}

export interface ConcessionAssemblyActivity {
  assemblyId: string;
  assemblyName: string | null;
  assemblyCode: string | null;
  actionCount: number;
  lastActionAt: string | null;
}

export interface ConcessionAuditSummary {
  actionsThisWeek: number;
  actionsThisMonth: number;
  assembliesActedOn: number;
  assembliesWithoutRecentActivity: number;
  pendingInvitationsOlderThan7Days: number;
}

export interface ConcessionAuditPage extends AuditPage {
  assemblies: ConcessionAssemblyActivity[];
  summary: ConcessionAuditSummary;
}

export interface AuditFilterState {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  action?: string;
  actionPrefix?: string;
  actorId?: string;
}

export function auditErrorMessage(code?: string, fallback?: string): string {
  switch (code) {
    case 'org_forbidden':
      return 'You do not have access to this assembly\'s audit history.';
    case 'concession_forbidden':
      return 'This assembly is outside your concession.';
    case 'role_forbidden':
      return 'Your role does not allow this audit view.';
    case 'assembly_not_provisioned':
      return 'This assembly has not finished ZITADEL onboarding yet.';
    case 'assembly_not_found':
      return 'This assembly could not be found.';
    case 'bad_request':
      return 'The selected audit filters are invalid.';
    case 'provisioning_not_configured':
      return 'Local ZITADEL provisioning is not configured for this service.';
    case 'audit_query_failed':
      return 'The audit history could not be loaded.';
    default:
      return fallback || 'The audit history could not be loaded.';
  }
}

export function formatAuditTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatAuditDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(date);
}

export function toDateInputValue(value: string | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function auditOutcomeTone(outcome: string): string {
  if (outcome === 'SUCCESS') return 'positive';
  if (outcome === 'FAILURE' || outcome === 'FAILED') return 'negative';
  return 'pending';
}

export function auditTargetLabel(entry: AuditEntry): string {
  const metadata = entry.metadata ?? {};
  const email = typeof metadata.email === 'string' ? metadata.email : null;
  const name = typeof metadata.name === 'string' ? metadata.name : null;
  if (name && email) return `${name} · ${email}`;
  return email ?? name ?? entry.resourceId ?? '—';
}

export function auditDescriptionMetadata(entry: AuditEntry): string | null {
  const summary = entry.metadata?.summary;
  if (!summary || typeof summary !== 'object') return null;
  const values = summary as Record<string, unknown>;
  const parts = [
    typeof values.total === 'number' ? `${values.total} rows` : null,
    typeof values.invited === 'number' ? `${values.invited} invited` : null,
    typeof values.failed === 'number' && values.failed > 0 ? `${values.failed} failed` : null,
    typeof values.needsReview === 'number' && values.needsReview > 0 ? `${values.needsReview} need review` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
