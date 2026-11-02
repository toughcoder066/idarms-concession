import { describe, expect, it } from 'vitest';
import {
  auditActionLabel,
  auditActorKind,
  formatAuditDescription,
} from './audit';

describe('shared audit formatting', () => {
  it('formats an invitation from structured fields', () => {
    expect(formatAuditDescription({
      action: 'staff.invited',
      assemblyName: 'Accra Metropolitan Assembly',
      metadata: {
        email: 'jane@example.com',
        role: 'FINANCE_OFFICER',
        inviteStatus: 'INVITED',
        humanReadable: 'ignored when structured fields exist',
      },
    })).toBe('Invited jane@example.com as Finance Officer in Accra Metropolitan Assembly.');
  });

  it('formats role changes and bulk import commits without parsing the stored sentence', () => {
    expect(formatAuditDescription({
      action: 'staff.role_changed',
      assemblyName: 'AMA',
      metadata: {
        email: 'jane@example.com',
        oldRole: 'CASHIER',
        newRole: 'FINANCE_OFFICER',
      },
    })).toBe("Changed jane@example.com's role from Cashier to Finance Officer in AMA.");

    expect(formatAuditDescription({
      action: 'staff.bulk_import.committed',
      assemblyName: 'AMA',
      metadata: {
        summary: { total: 3, invited: 1, alreadyExists: 1, failed: 0, needsReview: 1 },
      },
    })).toBe('Committed a 3-row staff import (1 invited, 1 already existed, 0 failed, 1 need review) in AMA.');
  });

  it('uses the stored sentence only for unknown actions', () => {
    expect(formatAuditDescription({
      action: 'custom.action',
      assemblyName: 'AMA',
      metadata: { humanReadable: 'A custom action happened.' },
    })).toBe('A custom action happened.');
  });

  it('classifies Super Admin and assembly actors distinctly', () => {
    expect(auditActorKind('CONCESSION_SUPER_ADMIN')).toBe('SUPER_ADMIN');
    expect(auditActorKind('ASSEMBLY_ADMIN')).toBe('ASSEMBLY');
    expect(auditActorKind('FIELD_AGENT')).toBe('ASSEMBLY');
    expect(auditActorKind(null)).toBe('UNKNOWN');
    expect(auditActionLabel('staff.bulk_import.user_invited')).toBe('Bulk import user invited');
    expect(auditActionLabel('staff.bulk_import.other')).toBe('Bulk import');
  });

  it('formats denied requests from structured security fields', () => {
    expect(auditActionLabel('security.request_denied')).toBe('Access denied');
    expect(formatAuditDescription({
      action: 'security.request_denied',
      assemblyName: 'Accra Metropolitan Assembly',
      metadata: {
        method: 'GET',
        path: '/v1/assemblies/ama/staff',
        code: 'org_forbidden',
      },
    })).toBe('Denied GET /v1/assemblies/ama/staff (org_forbidden) in Accra Metropolitan Assembly.');
  });
});
