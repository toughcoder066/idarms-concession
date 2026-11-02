import {
  auditActionLabel,
  formatAuditDescription,
  PREVIEW_PERSONAS,
  type PreviewPersonaKey,
} from '@idarms/contracts';

export interface PreviewStaffRow {
  name: string;
  email: string;
  role: string;
  status: 'active' | 'invited' | 'deactivated';
  lastLoginAt: string | null;
  invitedAt: string;
}

export interface PreviewAuditRow {
  id: string;
  occurredAt: string;
  actorName: string;
  actorRole: string;
  action: string;
  actionLabel: string;
  target: string;
  outcome: string;
  description: string;
}

export interface PreviewMetric {
  label: string;
  value: string;
  hint: string;
}

export interface PreviewFixture {
  persona: PreviewPersonaKey;
  label: string;
  description: string;
  assemblyName: string;
  assemblyCode: string;
  concessionName: string;
  scopeNote: string;
  metrics: PreviewMetric[];
  staff: PreviewStaffRow[];
  audit: PreviewAuditRow[];
  capabilities: string[];
  canManageStaff: boolean;
}

export const DEMO_ASSEMBLY_NAME = 'Demo Assembly';
export const DEMO_ASSEMBLY_CODE = 'DEMO';
export const DEMO_CONCESSION_NAME = 'Demo Concession';

const STAFF: PreviewStaffRow[] = [
  {
    name: 'Jane Preview',
    email: 'jane.preview@example.test',
    role: 'ASSEMBLY_ADMIN',
    status: 'active',
    lastLoginAt: '2026-01-15T09:15:00.000Z',
    invitedAt: '2025-11-02T08:00:00.000Z',
  },
  {
    name: 'Kwame Sample',
    email: 'kwame.sample@example.test',
    role: 'FINANCE_OFFICER',
    status: 'active',
    lastLoginAt: '2026-01-14T16:40:00.000Z',
    invitedAt: '2025-11-08T10:30:00.000Z',
  },
  {
    name: 'Nana Placeholder',
    email: 'nana.placeholder@example.test',
    role: 'FIELD_AGENT',
    status: 'active',
    lastLoginAt: '2026-01-15T07:20:00.000Z',
    invitedAt: '2025-12-01T09:00:00.000Z',
  },
  {
    name: 'Kojo Demo',
    email: 'kojo.demo@example.test',
    role: 'CASHIER',
    status: 'invited',
    lastLoginAt: null,
    invitedAt: '2026-01-12T14:05:00.000Z',
  },
  {
    name: 'Adwoa Example',
    email: 'adwoa.example@example.test',
    role: 'ASSEMBLY_VIEWER',
    status: 'deactivated',
    lastLoginAt: '2025-12-20T11:10:00.000Z',
    invitedAt: '2025-10-18T09:45:00.000Z',
  },
];

function previewAudit(
  id: string,
  occurredAt: string,
  actorName: string,
  actorRole: string,
  action: string,
  target: string,
  metadata: Record<string, unknown>,
  outcome = 'SUCCESS',
): PreviewAuditRow {
  return {
    id,
    occurredAt,
    actorName,
    actorRole,
    action,
    actionLabel: auditActionLabel(action),
    target,
    outcome,
    description: formatAuditDescription({
      action,
      assemblyName: DEMO_ASSEMBLY_NAME,
      metadata,
    }),
  };
}

const AUDIT: PreviewAuditRow[] = [
  previewAudit(
    'preview-audit-1',
    '2026-01-15T09:05:00.000Z',
    'Jane Preview',
    'ASSEMBLY_ADMIN',
    'staff.invited',
    'kojo.demo@example.test',
    {
      email: 'kojo.demo@example.test',
      role: 'CASHIER',
      inviteStatus: 'INVITED',
    },
  ),
  previewAudit(
    'preview-audit-2',
    '2026-01-14T15:30:00.000Z',
    'Jane Preview',
    'ASSEMBLY_ADMIN',
    'staff.role_changed',
    'kwame.sample@example.test',
    {
      email: 'kwame.sample@example.test',
      oldRole: 'CASHIER',
      newRole: 'FINANCE_OFFICER',
    },
  ),
  previewAudit(
    'preview-audit-3',
    '2026-01-13T11:45:00.000Z',
    'Demo Support',
    'CONCESSION_SUPER_ADMIN',
    'staff.bulk_import.committed',
    'batch-demo-001',
    {
      summary: { total: 3, invited: 2, alreadyExists: 1, failed: 0, needsReview: 0 },
      batchId: 'batch-demo-001',
    },
  ),
  previewAudit(
    'preview-audit-4',
    '2026-01-12T08:20:00.000Z',
    'Jane Preview',
    'ASSEMBLY_ADMIN',
    'staff.deactivated',
    'adwoa.example@example.test',
    {
      email: 'adwoa.example@example.test',
      roles: ['ASSEMBLY_VIEWER'],
    },
  ),
  previewAudit(
    'preview-audit-5',
    '2026-01-10T10:00:00.000Z',
    'Demo Support',
    'CONCESSION_SUPER_ADMIN',
    'assembly.onboarding.completed',
    'demo-org',
    {},
  ),
];

const PERSONA_METRICS: Record<PreviewPersonaKey, PreviewMetric[]> = {
  ASSEMBLY_ADMIN: [
    { label: 'Active staff', value: '12', hint: 'Demo fixture' },
    { label: 'Invited / pending', value: '3', hint: 'Demo fixture' },
    { label: 'Open approvals', value: '4', hint: 'Demo fixture' },
    { label: 'Audit entries', value: '128', hint: 'Demo fixture' },
  ],
  FIELD_OPS_MANAGER: [
    { label: 'Zones', value: '8', hint: 'Demo fixture' },
    { label: 'Field agents', value: '24', hint: 'Demo fixture' },
    { label: 'Open tasks', value: '17', hint: 'Demo fixture' },
    { label: 'Coverage', value: '86%', hint: 'Demo fixture' },
  ],
  FINANCE_OFFICER: [
    { label: 'Bills issued', value: '342', hint: 'Demo fixture' },
    { label: 'Collected', value: 'GHS 48,200', hint: 'Demo fixture' },
    { label: 'Outstanding', value: 'GHS 12,450', hint: 'Demo fixture' },
    { label: 'Reconciled', value: '91%', hint: 'Demo fixture' },
  ],
  SECRETARY: [
    { label: 'Documents', value: '57', hint: 'Demo fixture' },
    { label: 'Pending signatures', value: '6', hint: 'Demo fixture' },
    { label: 'Records updated', value: '14', hint: 'Demo fixture' },
    { label: 'Upcoming meetings', value: '2', hint: 'Demo fixture' },
  ],
  CASHIER: [
    { label: 'Receipts today', value: '38', hint: 'Demo fixture' },
    { label: 'Cash collected', value: 'GHS 4,250', hint: 'Demo fixture' },
    { label: 'Pending reconciliation', value: '3', hint: 'Demo fixture' },
    { label: 'Shift status', value: 'Open', hint: 'Demo fixture' },
  ],
  FIELD_AGENT: [
    { label: 'Assigned properties', value: '46', hint: 'Demo fixture' },
    { label: 'Visits today', value: '7', hint: 'Demo fixture' },
    { label: 'Pending verifications', value: '5', hint: 'Demo fixture' },
    { label: 'Zone coverage', value: '72%', hint: 'Demo fixture' },
  ],
  ASSEMBLY_VIEWER: [
    { label: 'Published reports', value: '6', hint: 'Demo fixture' },
    { label: 'Assembly notices', value: '3', hint: 'Demo fixture' },
    { label: 'Active staff', value: '12', hint: 'Demo fixture' },
    { label: 'Access', value: 'Read-only', hint: 'Demo fixture' },
  ],
};

const PERSONA_CAPABILITIES: Record<PreviewPersonaKey, string[]> = {
  ASSEMBLY_ADMIN: [
    'Manage staff within the assembly ceiling',
    'Review assembly activity and audit history',
    'Approve operational requests',
    'Manage targets and assembly settings',
  ],
  FIELD_OPS_MANAGER: [
    'Manage zones and field-agent assignments',
    'Review field task progress',
    'Track target performance',
    'Read assembly activity',
  ],
  FINANCE_OFFICER: [
    'Prepare fee-fixing and billing records',
    'Review payments and reconciliation',
    'Read financial reports',
    'No staff-management actions',
  ],
  SECRETARY: [
    'Manage assembly documents and records',
    'Prepare correspondence',
    'Read assembly activity',
    'No staff-management actions',
  ],
  CASHIER: [
    'Record payments and issue receipts',
    'View daily collection summaries',
    'Prepare reconciliation entries',
    'No staff-management actions',
  ],
  FIELD_AGENT: [
    'View assigned properties and visits',
    'Submit field verification data',
    'Read zone instructions',
    'No staff-management actions',
  ],
  ASSEMBLY_VIEWER: [
    'Read published assembly reports',
    'View assembly notices',
    'Read a limited staff summary',
    'No mutation actions',
  ],
};

const PERSONA_SCOPE: Record<PreviewPersonaKey, string> = {
  ASSEMBLY_ADMIN: 'Full assembly administration preview',
  FIELD_OPS_MANAGER: 'Field operations and zones preview',
  FINANCE_OFFICER: 'Finance and billing preview',
  SECRETARY: 'Records and correspondence preview',
  CASHIER: 'Payments and collections preview',
  FIELD_AGENT: 'Field task preview',
  ASSEMBLY_VIEWER: 'Read-only assembly preview',
};

export function getPreviewFixture(persona: PreviewPersonaKey): PreviewFixture {
  const definition = PREVIEW_PERSONAS.find((entry) => entry.key === persona);
  return {
    persona,
    label: definition?.label ?? persona,
    description: definition?.description ?? 'Simulated assembly role.',
    assemblyName: DEMO_ASSEMBLY_NAME,
    assemblyCode: DEMO_ASSEMBLY_CODE,
    concessionName: DEMO_CONCESSION_NAME,
    scopeNote: PERSONA_SCOPE[persona],
    metrics: PERSONA_METRICS[persona],
    staff: STAFF,
    audit: AUDIT,
    capabilities: PERSONA_CAPABILITIES[persona],
    canManageStaff: persona === 'ASSEMBLY_ADMIN',
  };
}
