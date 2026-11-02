import { describe, expect, it } from 'vitest';
import {
  deactivateStaff,
  editStaffRole,
  inviteStaff,
  listStaff,
  listStaffNotifications,
  reactivateStaff,
  resendStaffInvite,
  splitName,
} from './staff-service';
import { resolveStaffAccess } from './access';
import {
  actor,
  AMA_ID,
  assemblyAdminAuth,
  createHarness,
  fieldOpsAuth,
  LADMA_ID,
  noGrantAuth,
  ORG_AMA,
  ORG_LADMA,
  superAdminAuth,
} from './test-harness';

describe('resolveStaffAccess', () => {
  it('allows an Assembly Admin inside their own org only', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    expect(access.actorRole).toBe('ASSEMBLY_ADMIN');
    expect(access.allowedRoles).not.toContain('ASSEMBLY_ADMIN');
    expect(access.allowedRoles).not.toContain('CONCESSION_SUPER_ADMIN');

    await expect(resolveStaffAccess(harness.prisma, assemblyAdminAuth(), LADMA_ID))
      .rejects.toMatchObject({ code: 'org_forbidden', statusCode: 403 });
  });

  it('allows a Super Admin only in orgs where the token carries a grant', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);
    expect(access.actorRole).toBe('CONCESSION_SUPER_ADMIN');
    expect(access.allowedRoles).toContain('ASSEMBLY_ADMIN');

    await expect(resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), LADMA_ID))
      .rejects.toMatchObject({ code: 'org_forbidden', statusCode: 403 });
  });

  it('rejects Field Ops Managers even though they can manage agents elsewhere', async () => {
    const harness = createHarness();
    await expect(resolveStaffAccess(harness.prisma, fieldOpsAuth(), AMA_ID))
      .rejects.toMatchObject({ code: 'role_forbidden', statusCode: 403 });
  });

  it('rejects a caller with no grant in the assembly org', async () => {
    const harness = createHarness();
    await expect(resolveStaffAccess(harness.prisma, noGrantAuth(), AMA_ID))
      .rejects.toMatchObject({ code: 'org_forbidden', statusCode: 403 });
  });
});

describe('inviteStaff', () => {
  it('splits a mononym into a valid ZITADEL profile', () => {
    expect(splitName('Madonna')).toEqual({ firstName: 'Madonna', lastName: 'Madonna' });
    expect(splitName('Ama Mensah')).toEqual({ firstName: 'Ama', lastName: 'Mensah' });
  });

  it('invites a permitted staff role as an Assembly Admin and writes the audit trail', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const result = await inviteStaff(harness.deps, access, actor(), {
      name: 'New Agent',
      email: 'new-agent@ama.local',
      phone: '+233201234567',
      role: 'FIELD_AGENT',
    });

    expect(result).toMatchObject({
      email: 'new-agent@ama.local',
      role: 'FIELD_AGENT',
      inviteStatus: 'INVITED',
      notifiedAssemblyAdmin: false,
    });
    expect(harness.zitadel.calls.inviteHumanUser).toHaveLength(1);
    expect(harness.zitadel.grants.get(ORG_AMA)?.get(result.userId)).toEqual(['FIELD_AGENT']);
    expect(harness.state.staffMembers.get(`${AMA_ID}:${result.userId}`)).toMatchObject({
      email: 'new-agent@ama.local',
      role: 'FIELD_AGENT',
      invitedBy: 'ama-admin',
    });
    expect(harness.state.audits.some((entry) => entry.action === 'staff.invited')).toBe(true);
    expect(harness.state.notifications).toHaveLength(0);
  });

  it('invites as a Super Admin and notifies the active assembly admin', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);

    const result = await inviteStaff(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      {
        name: 'New Finance',
        email: 'new-finance@ama.local',
        role: 'FINANCE_OFFICER',
      },
    );

    expect(result.inviteStatus).toBe('INVITED');
    expect(result.notifiedAssemblyAdmin).toBe(true);
    expect(harness.state.notifications).toHaveLength(1);
    expect(harness.state.notifications[0]).toMatchObject({
      assemblyId: AMA_ID,
      actorId: 'super-1',
      action: 'staff.invited',
      targetRole: 'FINANCE_OFFICER',
    });
  });

  it('rejects an Assembly Admin inviting another Assembly Admin or Super Admin', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    for (const role of ['ASSEMBLY_ADMIN', 'CONCESSION_SUPER_ADMIN']) {
      await expect(inviteStaff(harness.deps, access, actor(), {
        name: 'Escalation Attempt',
        email: `escalate-${role}@ama.local`,
        role,
      })).rejects.toMatchObject({ code: 'role_forbidden', statusCode: 403 });
    }
    expect(harness.zitadel.calls.inviteHumanUser).toHaveLength(0);
  });

  it('treats an existing user with the same role as idempotent and rejects a role conflict', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const sameRole = await inviteStaff(harness.deps, access, actor(), {
      name: 'Fiona Finance',
      email: 'finance@ama.local',
      role: 'FINANCE_OFFICER',
    });
    expect(sameRole.inviteStatus).toBe('ALREADY_EXISTS');
    expect(harness.zitadel.calls.inviteHumanUser).toHaveLength(0);

    await expect(inviteStaff(harness.deps, access, actor(), {
      name: 'Fiona Finance',
      email: 'finance@ama.local',
      role: 'CASHIER',
    })).rejects.toMatchObject({ code: 'role_conflict', statusCode: 409 });
  });
});

describe('listStaff', () => {
  it('lists assembly staff with role, status, last login and inviter', async () => {
    const harness = createHarness();
    harness.zitadel.addUser(ORG_AMA, {
      userId: 'super-target',
      userName: 'super-target@ama.local',
      email: 'super-target@ama.local',
      firstName: 'Super',
      lastName: 'Target',
    });
    harness.zitadel.addGrant(ORG_AMA, 'super-target', ['CONCESSION_SUPER_ADMIN']);

    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    const rows = await listStaff(harness.deps, access);

    expect(rows.map((row) => row.userId).sort())
      .toEqual(['agent', 'ama-admin', 'finance', 'invited', 'ops']);
    expect(rows.find((row) => row.userId === 'finance')).toMatchObject({
      name: 'Fiona Finance',
      email: 'finance@ama.local',
      role: 'FINANCE_OFFICER',
      status: 'active',
      invitedBy: 'ama-admin',
      invitedAt: '2026-10-01T09:00:00.000Z',
    });
    expect(rows.find((row) => row.userId === 'invited')).toMatchObject({
      role: 'SECRETARY',
      status: 'invited',
    });
    expect(rows.find((row) => row.userId === 'agent')?.lastLoginAt)
      .toBe('2026-10-22T10:00:00.000Z');
  });

  it('returns only LADMA staff to a LADMA assembly admin', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(ORG_LADMA, 'ladma-admin'), LADMA_ID);
    const rows = await listStaff(harness.deps, access);
    expect(rows.map((row) => row.userId).sort()).toEqual(['ladma-admin', 'ladma-agent']);
  });

  it('rejects cross-org listing and callers without a grant', async () => {
    const harness = createHarness();
    await expect(resolveStaffAccess(harness.prisma, assemblyAdminAuth(), LADMA_ID))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(resolveStaffAccess(harness.prisma, noGrantAuth(), AMA_ID))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('editStaffRole', () => {
  it('changes a role within the Assembly Admin ceiling', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const result = await editStaffRole(harness.deps, access, actor(), 'finance', 'CASHIER');

    expect(result).toMatchObject({
      userId: 'finance',
      oldRole: 'FINANCE_OFFICER',
      newRole: 'CASHIER',
      changed: true,
      notifiedAssemblyAdmin: false,
    });
    expect(harness.zitadel.grants.get(ORG_AMA)?.get('finance')).toEqual(['CASHIER']);
    expect(harness.state.audits.some((entry) => entry.action === 'staff.role_changed')).toBe(true);
    expect(harness.state.notifications).toHaveLength(0);
  });

  it('notifies the assembly admin when a Super Admin changes a role', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);
    const result = await editStaffRole(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      'finance',
      'CASHIER',
    );
    expect(result.notifiedAssemblyAdmin).toBe(true);
    expect(harness.state.notifications).toHaveLength(1);
  });

  it('rejects escalation and targets above the caller ceiling', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    await expect(editStaffRole(harness.deps, access, actor(), 'ops', 'ASSEMBLY_ADMIN'))
      .rejects.toMatchObject({ code: 'role_forbidden', statusCode: 403 });
    await expect(editStaffRole(harness.deps, access, actor(), 'ama-admin', 'CASHIER'))
      .rejects.toMatchObject({ code: 'target_forbidden', statusCode: 403 });
    expect(harness.zitadel.calls.setUserGrantRoles).toHaveLength(0);
  });

  it('prevents demoting the last active Assembly Admin', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);
    await expect(editStaffRole(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      'ama-admin',
      'CASHIER',
    )).rejects.toMatchObject({ code: 'last_assembly_admin', statusCode: 409 });
  });
});

describe('deactivate and reactivate', () => {
  it('deactivates a staff member, revokes sessions and audits the action', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);

    const result = await deactivateStaff(harness.deps, access, actor(), 'agent');

    expect(result).toMatchObject({
      userId: 'agent',
      status: 'DEACTIVATED',
      revokedSessions: 1,
      notifiedAssemblyAdmin: false,
    });
    expect(harness.zitadel.calls.deactivateUser).toEqual([{ orgId: ORG_AMA, userId: 'agent' }]);
    expect(harness.zitadel.calls.revokeUserSessions).toEqual([{ orgId: ORG_AMA, userId: 'agent' }]);
    expect(harness.zitadel.sessions.get(ORG_AMA)?.get('agent')).toEqual([]);
    expect(harness.state.staffMembers.get(`${AMA_ID}:agent`)?.lastLoginAt)
      .toEqual(new Date('2026-10-22T10:00:00.000Z'));
    expect(harness.state.audits.some((entry) => entry.action === 'staff.deactivated')).toBe(true);

    const reactivated = await reactivateStaff(harness.deps, access, actor(), 'agent');
    expect(reactivated).toMatchObject({ status: 'REACTIVATED', revokedSessions: 0 });
    expect(harness.zitadel.users.get(ORG_AMA)?.get('agent')?.state).toBe('USER_STATE_ACTIVE');
    expect(harness.state.audits.some((entry) => entry.action === 'staff.reactivated')).toBe(true);

    const rows = await listStaff(harness.deps, access);
    expect(rows.find((row) => row.userId === 'agent')?.lastLoginAt)
      .toBe('2026-10-22T10:00:00.000Z');
  });

  it('notifies the assembly admin when a Super Admin deactivates a user', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);
    const result = await deactivateStaff(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      'agent',
    );
    expect(result.notifiedAssemblyAdmin).toBe(true);
    expect(harness.state.notifications).toHaveLength(1);
  });

  it('blocks self-deactivation', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    await expect(deactivateStaff(harness.deps, access, actor(), 'ama-admin'))
      .rejects.toMatchObject({ code: 'self_deactivation', statusCode: 403 });
    expect(harness.zitadel.calls.deactivateUser).toHaveLength(0);
  });

  it('blocks deactivating the last active Assembly Admin', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);
    await expect(deactivateStaff(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      'ama-admin',
    )).rejects.toMatchObject({ code: 'last_assembly_admin', statusCode: 409 });
    expect(harness.zitadel.calls.deactivateUser).toHaveLength(0);
  });

  it('rejects reactivating an active user', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    await expect(reactivateStaff(harness.deps, access, actor(), 'agent'))
      .rejects.toMatchObject({ code: 'already_active', statusCode: 409 });
  });
});

describe('resendStaffInvite', () => {
  it('resends an invitation for an INITIAL user and audits it', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    const result = await resendStaffInvite(harness.deps, access, actor(), 'invited');
    expect(result.status).toBe('RESENT');
    expect(harness.zitadel.calls.resendInvitation).toEqual([{ orgId: ORG_AMA, userId: 'invited' }]);
    expect(harness.state.audits.some((entry) => entry.action === 'staff.invite_resent')).toBe(true);
  });

  it('rejects resending for an active user', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, assemblyAdminAuth(), AMA_ID);
    await expect(resendStaffInvite(harness.deps, access, actor(), 'agent'))
      .rejects.toMatchObject({ code: 'not_invited', statusCode: 409 });
  });

  it('notifies the assembly admin when a Super Admin resends', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);
    const result = await resendStaffInvite(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      'invited',
    );
    expect(result.notifiedAssemblyAdmin).toBe(true);
    expect(harness.state.notifications).toHaveLength(1);
  });
});

describe('staff notifications', () => {
  it('persists Super Admin transparency notifications for the assembly', async () => {
    const harness = createHarness();
    const access = await resolveStaffAccess(harness.prisma, superAdminAuth([ORG_AMA]), AMA_ID);
    await inviteStaff(
      harness.deps,
      access,
      actor('super-1', 'CONCESSION_SUPER_ADMIN'),
      { name: 'Notify Target', email: 'notify@ama.local', role: 'FIELD_AGENT' },
    );
    const rows = await listStaffNotifications(harness.prisma, AMA_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: 'super-1', action: 'staff.invited' });
  });
});
