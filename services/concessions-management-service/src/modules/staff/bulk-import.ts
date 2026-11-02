import type { Prisma } from '../../../generated/prisma';
import { z } from 'zod';
import type { ZitadelHumanUser, ZitadelProjectUserGrant } from '../provisioning/zitadel-client';
import type { StaffAccessContext } from './access';
import { StaffDomainError } from './access';
import {
  notificationData,
  normalizeEmail,
  shouldNotifyAssemblyAdmin,
  splitName,
  staffAudit,
  upsertInvitedStaff,
  unique,
  type StaffActionDeps,
  type StaffActor,
} from './staff-service';

export type StaffImportPreviewStatus =
  | 'Valid'
  | 'Warning'
  | 'Duplicate'
  | 'Invalid role'
  | 'Invalid — assembly mismatch'
  | 'Error';

export type StaffImportCommitStatus =
  | 'Invited'
  | 'Already exists'
  | 'Failed – retry available'
  | 'Needs review';

export interface StaffImportPreviewRow {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  assemblyCode: string;
  orgId: string;
  status: StaffImportPreviewStatus;
  message?: string;
  normalized?: {
    name: string;
    email: string;
    phone?: string;
    role: string;
  };
}

export interface StaffImportCommitRow {
  rowNumber: number;
  name: string;
  email: string;
  role: string;
  status: StaffImportCommitStatus;
  message?: string;
  userId?: string;
}

interface OrgState {
  users: ZitadelHumanUser[];
  grants: ZitadelProjectUserGrant[];
  usersByEmail: Map<string, ZitadelHumanUser>;
  grantsByUser: Map<string, string[]>;
}

interface RowEvaluation {
  preview: StaffImportPreviewRow;
  existingUserId?: string;
  existingRoles?: string[];
}

const emailSchema = z.string().email();

export async function validateStaffImport(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  body: unknown,
): Promise<{
  batchId: string;
  assemblyId: string;
  summary: ReturnType<typeof previewSummary>;
  rows: StaffImportPreviewRow[];
}> {
  const inputRows = parseImportBody(body);
  const state = await loadOrgState(deps, access);
  const seenEmails = new Set<string>();
  const rows = inputRows.map((row, index) => evaluateRow(
    {
      rowNumber: index + 1,
      name: stringValue(row.name),
      email: stringValue(row.email),
      phone: stringValue(row.phone),
      role: stringValue(row.role),
      assemblyCode: stringValue(row.assemblyCode ?? row.assembly_code),
      orgId: stringValue(row.orgId ?? row.org_id),
    },
    { access, state, seenEmails },
  ).preview);

  const summary = previewSummary(rows);

  const batch = await deps.prisma.staffImportBatch.create({
    data: {
      assemblyId: access.assembly.id,
      concessionId: access.concessionId,
      orgId: access.orgId,
      status: 'VALIDATED',
      rows: rows as unknown as Prisma.InputJsonValue,
      createdBy: actor.actorId,
      createdByRole: access.actorRole,
    },
  });

  await deps.prisma.$transaction(async (tx) => {
    await deps.audit(tx, staffAudit(access, actor, {
      action: 'staff.bulk_import.validated',
      resourceType: 'StaffImportBatch',
      resourceId: batch.id,
      message: `Validated a ${rows.length}-row staff import for ${access.assembly.assemblyName}.`,
      metadata: { batchId: batch.id, summary },
    }));
  });

  return {
    batchId: batch.id,
    assemblyId: access.assembly.id,
    summary,
    rows,
  };
}

export async function commitStaffImport(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  batchId: string,
): Promise<{
  batchId: string;
  status: 'COMMITTED';
  summary: ReturnType<typeof commitSummary>;
  rows: StaffImportCommitRow[];
}> {
  const batch = await deps.prisma.staffImportBatch.findFirst({
    where: { id: batchId, assemblyId: access.assembly.id },
  });
  if (!batch) {
    throw new StaffDomainError('Import batch not found for this assembly.', 'batch_not_found', 404);
  }
  if (batch.status === 'COMMITTING') {
    throw new StaffDomainError('This import batch is already being committed.', 'batch_committing', 409);
  }
  if (batch.status !== 'VALIDATED' && batch.status !== 'COMMITTED' && batch.status !== 'FAILED') {
    throw new StaffDomainError('This import batch cannot be committed.', 'batch_not_committable', 409);
  }

  const claim = await deps.prisma.staffImportBatch.updateMany({
    where: { id: batch.id, assemblyId: access.assembly.id, status: batch.status },
    data: { status: 'COMMITTING' },
  });
  if (claim.count === 0) {
    throw new StaffDomainError('This import batch is already being committed.', 'batch_committing', 409);
  }

  const previewRows = Array.isArray(batch.rows) ? batch.rows as unknown as StaffImportPreviewRow[] : [];
  const state = await loadOrgState(deps, access);
  const seenEmails = new Set<string>();
  const results: StaffImportCommitRow[] = [];

  try {
    for (const stored of previewRows) {
      const evaluated = evaluateRow(stored, { access, state, seenEmails });
      const row: StaffImportCommitRow = {
        rowNumber: stored.rowNumber,
        name: stored.name,
        email: stored.email,
        role: stored.role,
        status: 'Needs review',
      };

      if (!evaluated.preview.normalized) {
        row.message = evaluated.preview.message ?? 'Row did not pass validation.';
        results.push(row);
        continue;
      }

      const existingUserId = evaluated.existingUserId;
      const existingRoles = evaluated.existingRoles ?? [];

      if (existingUserId && existingRoles.includes(stored.role)) {
        row.status = 'Already exists';
        row.userId = existingUserId;
        row.message = 'User already has this role in the assembly.';
        results.push(row);
        continue;
      }

      if (evaluated.preview.status !== 'Valid' && evaluated.preview.status !== 'Warning') {
        row.message = evaluated.preview.message ?? 'Row needs review before it can be imported.';
        results.push(row);
        continue;
      }

      if (existingUserId) {
        row.message = 'User already exists with a different role. Use Edit role instead.';
        results.push(row);
        continue;
      }

      try {
        const { firstName, lastName } = splitName(evaluated.preview.normalized.name);
        const invited = await deps.zitadel.inviteHumanUser({
          orgId: access.orgId,
          email: evaluated.preview.normalized.email,
          firstName,
          lastName,
          phone: evaluated.preview.normalized.phone,
        });
        await deps.zitadel.addUserGrant({
          orgId: access.orgId,
          userId: invited.userId,
          projectId: deps.projectId,
          roleKeys: [evaluated.preview.normalized.role],
        });

        await deps.prisma.$transaction(async (tx) => {
          await upsertInvitedStaff(tx, access, {
            userId: invited.userId,
            email: evaluated.preview.normalized!.email,
            name: evaluated.preview.normalized!.name,
            phone: evaluated.preview.normalized!.phone,
            role: evaluated.preview.normalized!.role,
            invitedBy: actor.actorId,
            status: 'INVITED',
          });
          await deps.audit(tx, staffAudit(access, actor, {
            action: 'staff.bulk_import.user_invited',
            resourceType: 'User',
            resourceId: invited.userId,
            message: `Bulk-imported ${evaluated.preview.normalized!.email} as ${evaluated.preview.normalized!.role} in ${access.assembly.assemblyName}.`,
            metadata: {
              batchId,
              email: evaluated.preview.normalized!.email,
              role: evaluated.preview.normalized!.role,
              rowNumber: stored.rowNumber,
            },
          }));
        });

        row.status = 'Invited';
        row.userId = invited.userId;
        results.push(row);

        state.usersByEmail.set(evaluated.preview.normalized.email, {
          userId: invited.userId,
          userName: evaluated.preview.normalized.email,
          email: evaluated.preview.normalized.email,
          state: 'USER_STATE_INITIAL',
          createdAt: new Date().toISOString(),
        });
        state.grants.push({
          id: `pending-${invited.userId}`,
          userId: invited.userId,
          userName: evaluated.preview.normalized.email,
          roleKeys: [evaluated.preview.normalized.role],
        });
        state.grantsByUser.set(invited.userId, [evaluated.preview.normalized.role]);
      } catch (error) {
        row.status = 'Failed – retry available';
        row.message = errorMessage(error);
        results.push(row);
      }
    }

    const summary = commitSummary(results);
    const notifiedAssemblyAdmin = await shouldNotifyAssemblyAdmin(deps, access);

    await deps.prisma.$transaction(async (tx) => {
      await tx.staffImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'COMMITTED',
          results: results as unknown as Prisma.InputJsonValue,
          committedAt: new Date(),
        },
      });
      await deps.audit(tx, staffAudit(access, actor, {
        action: 'staff.bulk_import.committed',
        resourceType: 'StaffImportBatch',
        resourceId: batch.id,
        message: `Committed a ${results.length}-row staff import for ${access.assembly.assemblyName}.`,
        metadata: {
          batchId: batch.id,
          summary,
          createdBy: batch.createdBy,
          createdByRole: batch.createdByRole,
        },
      }));
      if (notifiedAssemblyAdmin) {
        await tx.staffNotification.create({
          data: notificationData(access, actor, {
            action: 'staff.bulk_import.committed',
            message: `Concession Super Admin committed a ${results.length}-row staff import (${summary.invited} invited, ${summary.alreadyExists} already existed, ${summary.failed} failed, ${summary.needsReview} need review).`,
          }),
        });
      }
    });

    return {
      batchId: batch.id,
      status: 'COMMITTED',
      summary,
      rows: results,
    };
  } catch (error) {
    await deps.prisma.staffImportBatch.update({
      where: { id: batch.id },
      data: {
        status: 'FAILED',
        results: results as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
    throw error;
  }
}

export async function getStaffImportBatch(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  batchId: string,
) {
  const batch = await deps.prisma.staffImportBatch.findFirst({
    where: { id: batchId, assemblyId: access.assembly.id },
  });
  if (!batch) {
    throw new StaffDomainError('Import batch not found for this assembly.', 'batch_not_found', 404);
  }
  return {
    batchId: batch.id,
    assemblyId: batch.assemblyId,
    status: batch.status,
    rows: batch.rows,
    results: batch.results,
    createdBy: batch.createdBy,
    createdByRole: batch.createdByRole,
    createdAt: batch.createdAt,
    committedAt: batch.committedAt,
  };
}

export function parseImportBody(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) return normalizeInputRows(body);
  if (typeof body === 'string') return normalizeInputRows(parseCsv(body));
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.rows)) return normalizeInputRows(record.rows);
    if (Array.isArray(record.data)) return normalizeInputRows(record.data);
    if (typeof record.csv === 'string') return normalizeInputRows(parseCsv(record.csv));
  }
  throw new StaffDomainError(
    'Provide a JSON array of rows, { rows: [...] }, or CSV text.',
    'invalid_import_payload',
    400,
  );
}

function normalizeInputRows(rows: unknown[]): Array<Record<string, unknown>> {
  if (rows.length === 0) {
    throw new StaffDomainError('The import file contains no rows.', 'empty_import', 400);
  }
  if (rows.length > 500) {
    throw new StaffDomainError('A single import is limited to 500 rows.', 'import_too_large', 400);
  }
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new StaffDomainError('Every import row must be an object.', 'invalid_import_row', 400);
    }
    const record = row as Record<string, unknown>;
    return {
      name: record.name ?? record.fullName ?? record.full_name ?? record.fullname,
      email: record.email,
      phone: record.phone,
      role: record.role,
      assemblyCode: record.assemblyCode ?? record.assembly_code ?? record.assemblycode,
      orgId: record.orgId ?? record.org_id ?? record.orgid,
    };
  });
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[\s_-]+/g, ''));
  return rows.slice(1)
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = (cells[index] ?? '').trim();
      });
      return record;
    });
}

function evaluateRow(
  input: {
    rowNumber: number;
    name: string;
    email: string;
    phone: string;
    role: string;
    assemblyCode: string;
    orgId: string;
  },
  context: {
    access: StaffAccessContext;
    state: OrgState;
    seenEmails: Set<string>;
  },
): RowEvaluation {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = input.phone.trim();
  const role = input.role.trim();
  const assemblyCode = input.assemblyCode.trim();
  const orgId = input.orgId.trim();

  const preview: StaffImportPreviewRow = {
    rowNumber: input.rowNumber,
    name,
    email,
    phone,
    role,
    assemblyCode,
    orgId,
    status: 'Valid',
  };

  if (!name) return { preview: withStatus(preview, 'Error', 'Name is required.') };
  if (!email) return { preview: withStatus(preview, 'Error', 'Email is required.') };
  if (!emailSchema.safeParse(email).success) {
    return { preview: withStatus(preview, 'Error', 'Email format is invalid.') };
  }
  if (!role) return { preview: withStatus(preview, 'Error', 'Role is required.') };

  if (!context.access.allowedRoles.includes(role)) {
    return { preview: withStatus(preview, 'Invalid role', 'Invalid role — not permitted for this account.') };
  }

  if (assemblyCode && assemblyCode.toLowerCase() !== context.access.assembly.assemblyCode.toLowerCase()) {
    return {
      preview: withStatus(
        preview,
        'Invalid — assembly mismatch',
        'Assembly code does not match this assembly.',
      ),
    };
  }
  if (orgId && orgId !== context.access.orgId) {
    return {
      preview: withStatus(
        preview,
        'Invalid — assembly mismatch',
        'Organization ID does not match this assembly.',
      ),
    };
  }

  const duplicateInFile = context.seenEmails.has(email);
  context.seenEmails.add(email);
  if (duplicateInFile) {
    return { preview: withStatus(preview, 'Duplicate', 'Duplicate email within the import file.') };
  }

  const existingUser = context.state.usersByEmail.get(email);
  const existingRoles = existingUser ? context.state.grantsByUser.get(existingUser.userId) ?? [] : [];

  preview.normalized = {
    name,
    email,
    role,
    ...(phone ? { phone } : {}),
  };

  if (existingUser && existingRoles.includes(role)) {
    return {
      preview: withStatus(preview, 'Duplicate', `User already has the ${role} role in this assembly.`),
      existingUserId: existingUser.userId,
      existingRoles,
    };
  }
  if (existingUser) {
    return {
      preview: withStatus(preview, 'Duplicate', 'User already exists in this assembly with a different role.'),
      existingUserId: existingUser.userId,
      existingRoles,
    };
  }

  if (!phone) {
    return { preview: withStatus(preview, 'Warning', 'No phone number provided.') };
  }
  if (!/^[+()0-9][0-9 ()-]{5,29}$/.test(phone)) {
    return { preview: withStatus(preview, 'Warning', 'Phone number format may be invalid.') };
  }

  return { preview };
}

function withStatus(
  preview: StaffImportPreviewRow,
  status: StaffImportPreviewStatus,
  message: string,
): StaffImportPreviewRow {
  return { ...preview, status, message };
}

async function loadOrgState(deps: StaffActionDeps, access: StaffAccessContext): Promise<OrgState> {
  const [users, grants] = await Promise.all([
    deps.zitadel.listHumanUsers(access.orgId),
    deps.zitadel.listProjectUserGrants({ orgId: access.orgId, projectId: deps.projectId }),
  ]);
  const usersByEmail = new Map<string, ZitadelHumanUser>();
  for (const user of users) {
    const email = user.email ?? user.userName;
    if (email) usersByEmail.set(normalizeEmail(email), user);
  }
  const grantsByUser = new Map<string, string[]>();
  for (const grant of grants) {
    grantsByUser.set(grant.userId, unique([...(grantsByUser.get(grant.userId) ?? []), ...grant.roleKeys]));
  }
  return { users, grants, usersByEmail, grantsByUser };
}

function previewSummary(rows: StaffImportPreviewRow[]) {
  return {
    total: rows.length,
    valid: rows.filter((row) => row.status === 'Valid').length,
    warning: rows.filter((row) => row.status === 'Warning').length,
    duplicate: rows.filter((row) => row.status === 'Duplicate').length,
    invalidRole: rows.filter((row) => row.status === 'Invalid role').length,
    assemblyMismatch: rows.filter((row) => row.status === 'Invalid — assembly mismatch').length,
    error: rows.filter((row) => row.status === 'Error').length,
  };
}

function commitSummary(rows: StaffImportCommitRow[]) {
  return {
    total: rows.length,
    invited: rows.filter((row) => row.status === 'Invited').length,
    alreadyExists: rows.filter((row) => row.status === 'Already exists').length,
    failed: rows.filter((row) => row.status === 'Failed – retry available').length,
    needsReview: rows.filter((row) => row.status === 'Needs review').length,
  };
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
