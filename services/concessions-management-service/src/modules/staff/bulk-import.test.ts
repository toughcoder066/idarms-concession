import { describe, expect, it } from 'vitest';
import {
  commitStaffImport,
  getStaffImportBatch,
  parseCsv,
  parseImportBody,
  validateStaffImport,
} from './bulk-import';
import { resolveStaffAccess } from './access';
import {
  actor,
  AMA_ID,
  assemblyAdminAuth,
  createHarness,
  LADMA_ID,
  ORG_AMA,
  ORG_LADMA,
  superAdminAuth,
} from './test-harness';

const mixedRows = [
  { name: 'New Agent', email: 'new-agent@ama.local', phone: '+233201234567', role: 'FIELD_AGENT' },
  { name: 'No Phone', email: 'no-phone@ama.local', role: 'FIELD_AGENT' },
  { name: 'Fiona Finance', email: 'finance@ama.local', role: 'FINANCE_OFFICER' },
  { name: 'Oscar Ops', email: 'ops@ama.local', role: 'CASHIER' },
  { name: 'Escalation', email: 'escalate@ama.local', role: 'ASSEMBLY_ADMIN' },
  {
    name: 'Mismatch',
    email: 'mismatch@ama.local',
    role: 'FIELD_AGENT',
    assemblyCode: 'LADMA',
  },
  { name: 'Bad Email', email: 'not-an-email', role: 'FIELD_AGENT' },
];

describe('CSV parsing', () => {
  it('parses quoted CSV values and normalizes assembly/org headers', () => {
    const csv = [
      'name,email,phone,role,assembly_code,org_id',
      '"New, Agent",new-agent@ama.local,+233201234567,FIELD_AGENT,AMA,org-ama',
      'Second Person,second@ama.local,,FINANCE_OFFICER,AMA,org-ama',
    ].join('\n');

    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'New, Agent',
      email: 'new-agent@ama.local',
      role: 'FIELD_AGENT',
      assemblycode: 'AMA',
      orgid: 'org-ama',
    });

    const normalized = parseImportBody({ csv });
    expect(normalized[0]).toMatchObject({
      name: 'New, Agent',
      assemblyCode: 'AMA',
      orgId: 'org-ama',
    });
  });

  it('rejects empty or malformed import payloads', () => {
    expect(() => parseImportBody({})).toThrowError(/JSON array|CSV/);
    expect(() => parseImportBody([])).toThrowError(/no rows/i);
  });
});

describe('bulk import validate', () => {
  it('previews every row without writing to ZITADEL', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const result = await validateStaffImport(
      harness.deps,
      access,
      actor(),
      { rows: mixedRows },
    );

    expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.summary).toEqual({
      total: 7,
      valid: 1,
      warning: 1,
      duplicate: 2,
      invalidRole: 1,
      assemblyMismatch: 1,
      error: 1,
    });
    expect(result.rows.map((row) => row.status)).toEqual([
      'Valid',
      'Warning',
      'Duplicate',
      'Duplicate',
      'Invalid role',
      'Invalid — assembly mismatch',
      'Error',
    ]);
    expect(result.rows[4].message).toContain('not permitted for this account');
    expect(result.rows[5].message).toContain('Assembly code');
    expect(harness.zitadel.calls.inviteHumanUser).toHaveLength(0);
    expect(harness.zitadel.calls.addUserGrant).toHaveLength(0);

    const stored = await getStaffImportBatch(harness.deps, access, result.batchId);
    expect(stored.status).toBe('VALIDATED');
    expect(Array.isArray(stored.rows)).toBe(true);
    expect(harness.state.audits.some((entry) => entry.action === 'staff.bulk_import.validated'))
      .toBe(true);
  });

  it('validates CSV through the same path', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    const csv = [
      'name,email,phone,role,assembly_code,org_id',
      'CSV Agent,csv-agent@ama.local,+233201234567,FIELD_AGENT,AMA,org-ama',
      'CSV Escalate,csv-escalate@ama.local,,ASSEMBLY_ADMIN,AMA,org-ama',
    ].join('\n');

    const result = await validateStaffImport(harness.deps, access, actor(), csv);
    expect(result.rows.map((row) => row.status)).toEqual(['Valid', 'Invalid role']);
  });
});

describe('bulk import commit', () => {
  it('commits a mixed batch with per-row outcomes and persists the results', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const validated = await validateStaffImport(
      harness.deps,
      access,
      actor(),
      { rows: mixedRows },
    );
    const committed = await commitStaffImport(harness.deps, access, actor(), validated.batchId);

    expect(committed.status).toBe('COMMITTED');
    expect(committed.summary).toEqual({
      total: 7,
      invited: 2,
      alreadyExists: 1,
      failed: 0,
      needsReview: 4,
    });
    expect(committed.rows.map((row) => row.status)).toEqual([
      'Invited',
      'Invited',
      'Already exists',
      'Needs review',
      'Needs review',
      'Needs review',
      'Needs review',
    ]);
    expect(harness.zitadel.calls.inviteHumanUser).toHaveLength(2);
    expect(harness.zitadel.calls.inviteHumanUser.map((call) => call.email).sort())
      .toEqual(['new-agent@ama.local', 'no-phone@ama.local']);
    expect(harness.zitadel.grants.get(ORG_AMA)?.get('1001')).toEqual(['FIELD_AGENT']);
    expect(harness.state.staffMembers.get(`${AMA_ID}:1001`)).toMatchObject({
      role: 'FIELD_AGENT',
      invitedBy: 'ama-admin',
    });
    expect(harness.state.audits.filter((entry) => entry.action === 'staff.bulk_import.user_invited'))
      .toHaveLength(2);
    expect(harness.state.audits.some((entry) => entry.action === 'staff.bulk_import.committed'))
      .toBe(true);

    const stored = await getStaffImportBatch(harness.deps, access, validated.batchId);
    expect(stored.status).toBe('COMMITTED');
    expect(stored.results).toEqual(committed.rows);
  });

  it('is safe to re-commit: successful rows become Already exists and no second invite is sent', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const validated = await validateStaffImport(
      harness.deps,
      access,
      actor(),
      { rows: mixedRows },
    );
    await commitStaffImport(harness.deps, access, actor(), validated.batchId);
    const second = await commitStaffImport(harness.deps, access, actor(), validated.batchId);

    expect(second.summary).toEqual({
      total: 7,
      invited: 0,
      alreadyExists: 3,
      failed: 0,
      needsReview: 4,
    });
    expect(harness.zitadel.calls.inviteHumanUser).toHaveLength(2);
  });

  it('records Failed – retry available when a ZITADEL invite fails', async () => {
    const harness = createHarness({ failInvite: true });
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const validated = await validateStaffImport(
      harness.deps,
      access,
      actor(),
      {
        rows: [
          { name: 'Retry Agent', email: 'retry@ama.local', phone: '+233201234567', role: 'FIELD_AGENT' },
        ],
      },
    );
    const committed = await commitStaffImport(harness.deps, access, actor(), validated.batchId);

    expect(committed.rows[0]).toMatchObject({
      status: 'Failed – retry available',
      email: 'retry@ama.local',
    });
    expect(committed.summary.failed).toBe(1);
    expect(harness.state.audits.some((entry) => entry.action === 'staff.bulk_import.user_invited'))
      .toBe(false);
    expect(harness.state.audits.some((entry) => entry.action === 'staff.bulk_import.committed'))
      .toBe(true);
  });

  it('notifies the assembly admin when a Super Admin commits a batch', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);

    const validated = await validateStaffImport(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      {
        rows: [
          { name: 'Super Bulk', email: 'super-bulk@ama.local', phone: '+233201234567', role: 'FIELD_AGENT' },
        ],
      },
    );
    const committed = await commitStaffImport(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      validated.batchId,
    );

    expect(committed.summary.invited).toBe(1);
    expect(harness.state.notifications).toHaveLength(1);
    expect(harness.state.notifications[0]).toMatchObject({
      assemblyId: AMA_ID,
      actorId: 'super-1',
      action: 'staff.bulk_import.committed',
    });
  });

  it('does not allow a batch from AMA to be committed through LADMA', async () => {
    const harness = createHarness();
    const amaAccess = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    const ladmaAccess = await resolveStaffAccess(
      harness.prisma,
      assemblyAdminAuth(ORG_LADMA, 'ladma-admin'),
      LADMA_ID,
    );

    const validated = await validateStaffImport(
      harness.deps,
      amaAccess,
      actor(),
      { rows: [mixedRows[0]] },
    );

    await expect(commitStaffImport(harness.deps, ladmaAccess, actor('ladma-admin'), validated.batchId))
      .rejects.toMatchObject({ code: 'batch_not_found', statusCode: 404 });
  });
});
