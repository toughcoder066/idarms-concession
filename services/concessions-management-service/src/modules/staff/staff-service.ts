import type { Prisma, PrismaClient } from '../../../generated/prisma';
import type { AuditInput } from '../concessions/audit';
import type {
  ZitadelHumanUser,
  ZitadelProjectUserGrant,
  ZitadelStaffClient,
} from '../provisioning/zitadel-client';
import {
  assertCanManageTarget,
  assertRoleAllowed,
  STAFF_ROLE_KEYS,
  StaffAccessContext,
  StaffAccessError,
  StaffDomainError,
} from './access';

export type StaffAuditWriter = (tx: Prisma.TransactionClient, input: AuditInput) => Promise<void>;

export interface StaffActionDeps {
  prisma: PrismaClient;
  zitadel: ZitadelStaffClient;
  projectId: string;
  audit: StaffAuditWriter;
}

export interface StaffActor {
  actorId: string;
  actorRole: string;
  actorName?: string;
  actorEmail?: string;
  requestId: string;
}

export interface InviteStaffInput {
  name: string;
  email: string;
  phone?: string;
  role: string;
}

export interface StaffMemberView {
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

export interface StaffInviteResult {
  userId: string;
  email: string;
  role: string;
  inviteStatus: 'INVITED' | 'ALREADY_EXISTS' | 'EXISTING_USER_GRANTED';
  notifiedAssemblyAdmin: boolean;
}

export interface StaffRoleChangeResult {
  userId: string;
  oldRole: string;
  newRole: string;
  changed: boolean;
  notifiedAssemblyAdmin: boolean;
}

export interface StaffStateChangeResult {
  userId: string;
  status: 'DEACTIVATED' | 'REACTIVATED';
  revokedSessions: number;
  notifiedAssemblyAdmin: boolean;
}

interface OrgSnapshot {
  users: ZitadelHumanUser[];
  userById: Map<string, ZitadelHumanUser>;
  grants: ZitadelProjectUserGrant[];
  lastLoginByUser: Map<string, string>;
}

const STAFF_ROLE_PRIORITY = [...STAFF_ROLE_KEYS];
const assemblyActionLocks = new Map<string, Promise<void>>();

async function withAssemblyActionLock<T>(assemblyId: string, action: () => Promise<T>): Promise<T> {
  const previous = assemblyActionLocks.get(assemblyId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chained = previous.then(() => current);
  assemblyActionLocks.set(assemblyId, chained);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (assemblyActionLocks.get(assemblyId) === chained) assemblyActionLocks.delete(assemblyId);
  }
}

export async function inviteStaff(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  input: InviteStaffInput,
): Promise<StaffInviteResult> {
  assertRoleAllowed(access, input.role);
  const email = normalizeEmail(input.email);
  const { firstName, lastName } = splitName(input.name);

  const existing = await deps.zitadel.findUserByEmail({ orgId: access.orgId, email });
  let userId: string;
  let inviteStatus: StaffInviteResult['inviteStatus'];

  if (existing) {
    const existingUser = await deps.zitadel.getUser(access.orgId, existing.userId);
    if (!existingUser || (existingUser.state !== 'USER_STATE_ACTIVE' && existingUser.state !== 'USER_STATE_INITIAL')) {
      throw new StaffDomainError(
        'The existing user is not active or invited and cannot be granted staff access.',
        'user_inactive',
        409,
      );
    }
    const grants = await deps.zitadel.listUserGrants({
      orgId: access.orgId,
      userId: existing.userId,
      projectId: deps.projectId,
    });
    const currentRoles = unique(grants.flatMap((grant) => grant.roleKeys));

    if (currentRoles.includes(input.role)) {
      userId = existing.userId;
      inviteStatus = 'ALREADY_EXISTS';
    } else if (currentRoles.length > 0) {
      throw new StaffDomainError(
        'User already exists in this assembly with a different iDARMS role. Use Edit role instead.',
        'role_conflict',
        409,
      );
    } else {
      await deps.zitadel.addUserGrant({
        orgId: access.orgId,
        userId: existing.userId,
        projectId: deps.projectId,
        roleKeys: [input.role],
      });
      userId = existing.userId;
      inviteStatus = 'EXISTING_USER_GRANTED';
    }
  } else {
    const invited = await deps.zitadel.inviteHumanUser({
      orgId: access.orgId,
      email,
      firstName,
      lastName,
      phone: input.phone,
    });
    await deps.zitadel.addUserGrant({
      orgId: access.orgId,
      userId: invited.userId,
      projectId: deps.projectId,
      roleKeys: [input.role],
    });
    userId = invited.userId;
    inviteStatus = 'INVITED';
  }

  const notifiedAssemblyAdmin = await shouldNotifyAssemblyAdmin(deps, access);

  await deps.prisma.$transaction(async (tx) => {
    await upsertInvitedStaff(tx, access, {
      userId,
      email,
      name: input.name.trim(),
      phone: input.phone,
      role: input.role,
      invitedBy: actor.actorId,
      status: inviteStatus === 'INVITED' ? 'INVITED' : 'ACTIVE',
    });
    await deps.audit(tx, staffAudit(access, actor, {
      action: 'staff.invited',
      resourceType: 'User',
      resourceId: userId,
      message: `${inviteStatus === 'INVITED' ? 'Invited' : 'Granted'} ${email} as ${input.role} in ${access.assembly.assemblyName}.`,
      metadata: {
        email,
        name: input.name,
        role: input.role,
        inviteStatus,
        phone: input.phone ?? null,
      },
    }));
    if (notifiedAssemblyAdmin) {
      await tx.staffNotification.create({
        data: notificationData(access, actor, {
          action: 'staff.invited',
          targetUserId: userId,
          targetRole: input.role,
          message: `Concession Super Admin invited ${email} as ${input.role} in ${access.assembly.assemblyName}.`,
        }),
      });
    }
  });

  return {
    userId,
    email,
    role: input.role,
    inviteStatus,
    notifiedAssemblyAdmin,
  };
}

export async function listStaff(
  deps: StaffActionDeps,
  access: StaffAccessContext,
): Promise<StaffMemberView[]> {
  const snapshot = await loadOrgSnapshot(deps.zitadel, access.orgId, deps.projectId);
  const localRows = await deps.prisma.staffMember.findMany({
    where: { assemblyId: access.assembly.id },
  });
  const localById = new Map(localRows.map((row) => [row.userId, row]));

  const rolesByUser = new Map<string, string[]>();
  for (const grant of snapshot.grants) {
    const staffRoles = sortStaffRoles(grant.roleKeys);
    if (staffRoles.length === 0) continue;
    rolesByUser.set(grant.userId, unique([...(rolesByUser.get(grant.userId) ?? []), ...staffRoles]));
  }

  const result: StaffMemberView[] = [];
  for (const [userId, roles] of rolesByUser) {
    const user = snapshot.userById.get(userId);
    if (!user) continue;
    const local = localById.get(userId);
    const sortedRoles = sortStaffRoles(roles);
    result.push({
      userId,
      name: local?.name ?? displayName(user),
      email: local?.email ?? user.email ?? user.userName,
      phone: local?.phone ?? null,
      role: sortedRoles[0] ?? '',
      roles: sortedRoles,
      status: statusFromUserState(user.state),
      lastLoginAt: snapshot.lastLoginByUser.get(userId) ?? local?.lastLoginAt?.toISOString() ?? null,
      invitedAt: local?.invitedAt?.toISOString() ?? user.createdAt ?? null,
      invitedBy: local?.invitedBy ?? null,
    });
  }

  return result.sort((left, right) => left.name.localeCompare(right.name));
}

export async function editStaffRole(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  userId: string,
  newRole: string,
): Promise<StaffRoleChangeResult> {
  return withAssemblyActionLock(
    access.assembly.id,
    () => editStaffRoleUnlocked(deps, access, actor, userId, newRole),
  );
}

async function editStaffRoleUnlocked(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  userId: string,
  newRole: string,
): Promise<StaffRoleChangeResult> {
  assertRoleAllowed(access, newRole);
  const user = await deps.zitadel.getUser(access.orgId, userId);
  if (!user) throw new StaffDomainError('User not found in this organization.', 'staff_not_found', 404);

  const grants = await deps.zitadel.listUserGrants({
    orgId: access.orgId,
    userId,
    projectId: deps.projectId,
  });
  const currentRoles = unique(grants.flatMap((grant) => grant.roleKeys));
  assertNotSuperAdminTarget(access, currentRoles, 'change');
  assertCanManageTarget(access, currentRoles);

  const currentStaffRoles = sortStaffRoles(currentRoles);
  if (currentStaffRoles.length === 0) {
    throw new StaffDomainError('User has no assembly staff role in this organization.', 'staff_not_found', 404);
  }
  const oldRole = currentStaffRoles[0];

  if (currentRoles.length === 1 && oldRole === newRole) {
    return {
      userId,
      oldRole,
      newRole,
      changed: false,
      notifiedAssemblyAdmin: false,
    };
  }

  if (currentStaffRoles.includes('ASSEMBLY_ADMIN') && newRole !== 'ASSEMBLY_ADMIN') {
    await assertNotLastActiveAssemblyAdmin(deps, access, userId);
  }

  await deps.zitadel.setUserGrantRoles({
    orgId: access.orgId,
    userId,
    projectId: deps.projectId,
    roleKeys: [newRole],
  });

  const notifiedAssemblyAdmin = await shouldNotifyAssemblyAdmin(deps, access);

  await deps.prisma.$transaction(async (tx) => {
    await tx.staffMember.updateMany({
      where: { assemblyId: access.assembly.id, userId },
      data: { role: newRole },
    });
    await deps.audit(tx, staffAudit(access, actor, {
      action: 'staff.role_changed',
      resourceType: 'User',
      resourceId: userId,
      message: `Changed ${user.email ?? user.userName} from ${oldRole} to ${newRole} in ${access.assembly.assemblyName}.`,
      metadata: { oldRole, newRole, oldRoles: currentRoles, email: user.email ?? null },
    }));
    if (notifiedAssemblyAdmin) {
      await tx.staffNotification.create({
        data: notificationData(access, actor, {
          action: 'staff.role_changed',
          targetUserId: userId,
          targetRole: newRole,
          message: `Concession Super Admin changed ${user.email ?? user.userName} from ${oldRole} to ${newRole}.`,
        }),
      });
    }
  });

  return {
    userId,
    oldRole,
    newRole,
    changed: true,
    notifiedAssemblyAdmin,
  };
}

export async function deactivateStaff(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  userId: string,
): Promise<StaffStateChangeResult> {
  return withAssemblyActionLock(
    access.assembly.id,
    () => deactivateStaffUnlocked(deps, access, actor, userId),
  );
}

async function deactivateStaffUnlocked(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  userId: string,
): Promise<StaffStateChangeResult> {
  if (userId === actor.actorId) {
    throw new StaffAccessError(
      'You cannot deactivate your own account.',
      'self_deactivation',
      403,
      {
        assemblyId: access.assembly.id,
        concessionId: access.concessionId,
        assemblyName: access.assembly.assemblyName,
      },
    );
  }

  const user = await deps.zitadel.getUser(access.orgId, userId);
  if (!user) throw new StaffDomainError('User not found in this organization.', 'staff_not_found', 404);

  const grants = await deps.zitadel.listUserGrants({
    orgId: access.orgId,
    userId,
    projectId: deps.projectId,
  });
  const currentRoles = unique(grants.flatMap((grant) => grant.roleKeys));
  assertNotSuperAdminTarget(access, currentRoles, 'deactivate');
  assertCanManageTarget(access, currentRoles);

  if (user.state !== 'USER_STATE_ACTIVE') {
    throw new StaffDomainError(
      'Only an active user can be deactivated.',
      'not_active',
      409,
    );
  }

  await assertNotLastActiveAssemblyAdmin(deps, access, userId);

  const sessionsBeforeDeactivation = await deps.zitadel.listUserSessions({
    orgId: access.orgId,
    userId,
  });
  const lastLoginAt = latestSessionDate(sessionsBeforeDeactivation);

  await deps.zitadel.deactivateUser({ orgId: access.orgId, userId });
  const revokedSessions = await deps.zitadel.revokeUserSessions({ orgId: access.orgId, userId });

  const notifiedAssemblyAdmin = await shouldNotifyAssemblyAdmin(deps, access);

  await deps.prisma.$transaction(async (tx) => {
    await tx.staffMember.updateMany({
      where: { assemblyId: access.assembly.id, userId },
      data: {
        lastKnownStatus: 'DEACTIVATED',
        ...(lastLoginAt ? { lastLoginAt: new Date(lastLoginAt) } : {}),
      },
    });
    await deps.audit(tx, staffAudit(access, actor, {
      action: 'staff.deactivated',
      resourceType: 'User',
      resourceId: userId,
      message: `Deactivated ${user.email ?? user.userName} in ${access.assembly.assemblyName}.`,
      metadata: { email: user.email ?? null, name: user.displayName ?? null, roles: currentRoles, revokedSessions },
    }));
    if (notifiedAssemblyAdmin) {
      await tx.staffNotification.create({
        data: notificationData(access, actor, {
          action: 'staff.deactivated',
          targetUserId: userId,
          targetRole: currentRoles[0] ?? null,
          message: `Concession Super Admin deactivated ${user.email ?? user.userName}.`,
        }),
      });
    }
  });

  return {
    userId,
    status: 'DEACTIVATED',
    revokedSessions,
    notifiedAssemblyAdmin,
  };
}

export async function reactivateStaff(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  userId: string,
): Promise<StaffStateChangeResult> {
  const user = await deps.zitadel.getUser(access.orgId, userId);
  if (!user) throw new StaffDomainError('User not found in this organization.', 'staff_not_found', 404);

  const grants = await deps.zitadel.listUserGrants({
    orgId: access.orgId,
    userId,
    projectId: deps.projectId,
  });
  const currentRoles = unique(grants.flatMap((grant) => grant.roleKeys));
  assertNotSuperAdminTarget(access, currentRoles, 'reactivate');
  assertCanManageTarget(access, currentRoles);

  if (user.state === 'USER_STATE_ACTIVE') {
    throw new StaffDomainError('User is already active.', 'already_active', 409);
  }
  if (user.state !== 'USER_STATE_INACTIVE') {
    throw new StaffDomainError(
      'Only a deactivated user can be reactivated.',
      'not_deactivated',
      409,
    );
  }

  await deps.zitadel.reactivateUser({ orgId: access.orgId, userId });

  const notifiedAssemblyAdmin = await shouldNotifyAssemblyAdmin(deps, access);

  await deps.prisma.$transaction(async (tx) => {
    await tx.staffMember.updateMany({
      where: { assemblyId: access.assembly.id, userId },
      data: { lastKnownStatus: 'ACTIVE' },
    });
    await deps.audit(tx, staffAudit(access, actor, {
      action: 'staff.reactivated',
      resourceType: 'User',
      resourceId: userId,
      message: `Reactivated ${user.email ?? user.userName} in ${access.assembly.assemblyName}.`,
      metadata: { email: user.email ?? null, name: user.displayName ?? null, roles: currentRoles },
    }));
    if (notifiedAssemblyAdmin) {
      await tx.staffNotification.create({
        data: notificationData(access, actor, {
          action: 'staff.reactivated',
          targetUserId: userId,
          targetRole: currentRoles[0] ?? null,
          message: `Concession Super Admin reactivated ${user.email ?? user.userName}.`,
        }),
      });
    }
  });

  return {
    userId,
    status: 'REACTIVATED',
    revokedSessions: 0,
    notifiedAssemblyAdmin,
  };
}

export async function resendStaffInvite(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  actor: StaffActor,
  userId: string,
): Promise<{ userId: string; status: 'RESENT'; notifiedAssemblyAdmin: boolean }> {
  const user = await deps.zitadel.getUser(access.orgId, userId);
  if (!user) throw new StaffDomainError('User not found in this organization.', 'staff_not_found', 404);

  const grants = await deps.zitadel.listUserGrants({
    orgId: access.orgId,
    userId,
    projectId: deps.projectId,
  });
  const currentRoles = unique(grants.flatMap((grant) => grant.roleKeys));
  assertNotSuperAdminTarget(access, currentRoles, 'resend an invitation for');
  assertCanManageTarget(access, currentRoles);

  if (user.state !== 'USER_STATE_INITIAL') {
    throw new StaffDomainError(
      'Invitations can only be resent for users in the invited state.',
      'not_invited',
      409,
    );
  }

  await deps.zitadel.resendInvitation({ orgId: access.orgId, userId });

  const notifiedAssemblyAdmin = await shouldNotifyAssemblyAdmin(deps, access);

  await deps.prisma.$transaction(async (tx) => {
    await deps.audit(tx, staffAudit(access, actor, {
      action: 'staff.invite_resent',
      resourceType: 'User',
      resourceId: userId,
      message: `Resent the invitation for ${user.email ?? user.userName} in ${access.assembly.assemblyName}.`,
      metadata: { email: user.email ?? null, roles: currentRoles },
    }));
    if (notifiedAssemblyAdmin) {
      await tx.staffNotification.create({
        data: notificationData(access, actor, {
          action: 'staff.invite_resent',
          targetUserId: userId,
          targetRole: currentRoles[0] ?? null,
          message: `Concession Super Admin resent the invitation for ${user.email ?? user.userName}.`,
        }),
      });
    }
  });

  return { userId, status: 'RESENT', notifiedAssemblyAdmin };
}

export async function listStaffNotifications(
  prisma: PrismaClient,
  assemblyId: string,
  limit = 50,
) {
  return prisma.staffNotification.findMany({
    where: { assemblyId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

export function staffAudit(
  access: StaffAccessContext,
  actor: StaffActor,
  detail: {
    action: string;
    resourceType: string;
    resourceId: string;
    message: string;
    metadata?: Record<string, unknown>;
  },
): AuditInput {
  return {
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    concessionId: access.concessionId,
    assemblyId: access.assembly.id,
    action: detail.action,
    resourceType: detail.resourceType,
    resourceId: detail.resourceId,
    requestId: actor.requestId,
    outcome: 'SUCCESS',
    humanReadable: detail.message,
    metadata: {
      actorRole: access.actorRole,
      ...(detail.metadata ?? {}),
    },
  };
}

export function notificationData(
  access: StaffAccessContext,
  actor: StaffActor,
  detail: {
    action: string;
    targetUserId?: string | null;
    targetRole?: string | null;
    message: string;
  },
) {
  return {
    assemblyId: access.assembly.id,
    concessionId: access.concessionId,
    actorId: actor.actorId,
    actorRole: access.actorRole,
    action: detail.action,
    targetUserId: detail.targetUserId ?? null,
    targetRole: detail.targetRole ?? null,
    message: detail.message,
  };
}

export async function upsertInvitedStaff(
  tx: Prisma.TransactionClient,
  access: StaffAccessContext,
  input: {
    userId: string;
    email: string;
    name: string;
    phone?: string;
    role: string;
    invitedBy: string;
    status: 'INVITED' | 'ACTIVE';
  },
): Promise<void> {
  await tx.staffMember.upsert({
    where: {
      assemblyId_userId: {
        assemblyId: access.assembly.id,
        userId: input.userId,
      },
    },
    create: {
      assemblyId: access.assembly.id,
      orgId: access.orgId,
      userId: input.userId,
      email: input.email,
      name: input.name,
      phone: input.phone?.trim() || null,
      role: input.role,
      invitedBy: input.invitedBy,
      invitedAt: new Date(),
      lastKnownStatus: input.status,
    },
    update: {
      email: input.email,
      name: input.name,
      phone: input.phone?.trim() || null,
      role: input.role,
      lastKnownStatus: input.status,
    },
  });
}

async function loadOrgSnapshot(
  zitadel: ZitadelStaffClient,
  orgId: string,
  projectId: string,
): Promise<OrgSnapshot> {
  const [users, grants, sessions] = await Promise.all([
    zitadel.listHumanUsers(orgId),
    zitadel.listProjectUserGrants({ orgId, projectId }),
    zitadel.listOrgSessions(orgId),
  ]);
  const userById = new Map(users.map((user) => [user.userId, user]));
  const lastLoginByUser = new Map<string, string>();
  for (const session of sessions) {
    if (!session.userId) continue;
    const candidate = session.changeDate || session.creationDate;
    const current = lastLoginByUser.get(session.userId);
    if (!current || candidate > current) lastLoginByUser.set(session.userId, candidate);
  }
  return { users, userById, grants, lastLoginByUser };
}

export async function shouldNotifyAssemblyAdmin(
  deps: StaffActionDeps,
  access: StaffAccessContext,
): Promise<boolean> {
  if (access.actorRole !== 'CONCESSION_SUPER_ADMIN') return false;
  const [users, grants] = await Promise.all([
    deps.zitadel.listHumanUsers(access.orgId),
    deps.zitadel.listProjectUserGrants({ orgId: access.orgId, projectId: deps.projectId }),
  ]);
  const adminIds = new Set(
    grants
      .filter((grant) => grant.roleKeys.includes('ASSEMBLY_ADMIN'))
      .map((grant) => grant.userId),
  );
  return users.some((user) => adminIds.has(user.userId) && user.state === 'USER_STATE_ACTIVE');
}

async function assertNotLastActiveAssemblyAdmin(
  deps: StaffActionDeps,
  access: StaffAccessContext,
  userId: string,
): Promise<void> {
  const [users, grants] = await Promise.all([
    deps.zitadel.listHumanUsers(access.orgId),
    deps.zitadel.listProjectUserGrants({ orgId: access.orgId, projectId: deps.projectId }),
  ]);
  const adminIds = new Set(
    grants
      .filter((grant) => grant.roleKeys.includes('ASSEMBLY_ADMIN'))
      .map((grant) => grant.userId),
  );
  const activeAdminIds = new Set(
    users
      .filter((user) => adminIds.has(user.userId) && user.state === 'USER_STATE_ACTIVE')
      .map((user) => user.userId),
  );
  if (activeAdminIds.has(userId) && activeAdminIds.size <= 1) {
    throw new StaffDomainError(
      'Cannot remove the last active Assembly Admin in this organization.',
      'last_assembly_admin',
      409,
    );
  }
}

function assertNotSuperAdminTarget(
  access: StaffAccessContext,
  currentRoles: readonly string[],
  verb: string,
): void {
  if (currentRoles.includes('CONCESSION_SUPER_ADMIN')) {
    throw new StaffAccessError(
      `CONCESSION_SUPER_ADMIN grants cannot be used to ${verb} this user through staff management.`,
      'role_forbidden',
      403,
      {
        assemblyId: access.assembly.id,
        concessionId: access.concessionId,
        assemblyName: access.assembly.assemblyName,
      },
    );
  }
}

function sortStaffRoles(roleKeys: readonly string[]): string[] {
  return STAFF_ROLE_PRIORITY.filter((role) => roleKeys.includes(role));
}

function statusFromUserState(state: string): StaffMemberView['status'] {
  if (state === 'USER_STATE_INITIAL') return 'invited';
  if (state === 'USER_STATE_ACTIVE') return 'active';
  if (state === 'USER_STATE_INACTIVE' || state === 'USER_STATE_LOCKED') return 'deactivated';
  return 'unknown';
}

function displayName(user: ZitadelHumanUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return user.displayName ?? (full || user.userName);
}

function latestSessionDate(sessions: ReadonlyArray<{ creationDate: string; changeDate: string }>): string | null {
  let latest: string | null = null;
  for (const session of sessions) {
    const candidate = session.changeDate || session.creationDate;
    if (!latest || candidate > latest) latest = candidate;
  }
  return latest;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? name.trim();
  return {
    firstName,
    // ZITADEL requires a non-empty last name (1–200 runes). For mononyms,
    // mirror the given name; the local staff record keeps the exact input name.
    lastName: parts.slice(1).join(' ') || firstName,
  };
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
