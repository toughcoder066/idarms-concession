'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  MailPlus,
  Pencil,
  Power,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { canManageUserWithRoles } from '@idarms/contracts';
import {
  resendStaffInviteAction,
  setStaffStateAction,
  updateStaffRoleAction,
} from '@/app/(portal)/assembly/[assemblyId]/staff-access/actions';
import {
  displayRole,
  staffErrorMessage,
  type StaffMember,
  type StaffRoleOption,
} from '@/lib/staff';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(date);
}

function statusTone(status: StaffMember['status']): string {
  if (status === 'active') return 'positive';
  if (status === 'invited') return 'pending';
  if (status === 'deactivated') return 'negative';
  return 'neutral';
}

export function StaffTable({
  assemblyId,
  staff,
  actorRole,
  allowedRoles,
  currentUserId,
  onChanged,
}: {
  assemblyId: string;
  staff: StaffMember[];
  actorRole: 'CONCESSION_SUPER_ADMIN' | 'ASSEMBLY_ADMIN';
  allowedRoles: StaffRoleOption[];
  currentUserId?: string;
  onChanged: () => void;
}) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function changeRole(member: StaffMember, role: string) {
    if (!role || role === member.role) return;
    setPendingUserId(member.userId);
    setActionError(null);
    const result = await updateStaffRoleAction(assemblyId, member.userId, role);
    setPendingUserId(null);
    if (!result.ok) {
      setActionError(staffErrorMessage(result.code, result.message));
      return;
    }
    onChanged();
  }

  async function toggleActive(member: StaffMember) {
    const action = member.status === 'active' ? 'deactivate' : 'reactivate';
    setPendingUserId(member.userId);
    setActionError(null);
    const result = await setStaffStateAction(assemblyId, member.userId, action);
    setPendingUserId(null);
    if (!result.ok) {
      setActionError(staffErrorMessage(result.code, result.message));
      return;
    }
    onChanged();
  }

  async function resend(member: StaffMember) {
    setPendingUserId(member.userId);
    setActionError(null);
    const result = await resendStaffInviteAction(assemblyId, member.userId);
    setPendingUserId(null);
    if (!result.ok) {
      setActionError(staffErrorMessage(result.code, result.message));
      return;
    }
    onChanged();
  }

  if (staff.length === 0) {
    return (
      <div className="staff-empty">
        <span className="empty-mark"><UserRound size={22} aria-hidden="true" /></span>
        <h3>No staff accounts yet</h3>
        <p>Invite the first staff member or import a CSV batch to populate this assembly.</p>
      </div>
    );
  }

  return (
    <div className="staff-table-wrap">
      {actionError && <div className="form-result error staff-action-error" role="alert">{actionError}</div>}
      <div className="table-wrap">
        <table className="directory-table staff-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th>Invitation</th>
              <th>Zones</th>
              <th className="staff-actions-heading">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const canManage = canManageUserWithRoles(actorRole, member.roles);
              const isSelf = Boolean(currentUserId && member.userId === currentUserId);
              const isPending = pendingUserId === member.userId;
              const isFieldRole = member.roles.some((role) => role === 'FIELD_AGENT' || role === 'FIELD_OPS_MANAGER');
              const canEdit = canManage && allowedRoles.length > 0;
              const canToggle = canManage && !isSelf && member.status !== 'invited';
              const canResend = canManage && member.status === 'invited';

              return (
                <tr key={member.userId} className={isSelf ? 'staff-self-row' : undefined}>
                  <td>
                    <div className="record-primary staff-identity">
                      <span className="record-avatar">{member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || <UserRound size={14} aria-hidden="true" />}</span>
                      <span>
                        <strong>{member.name}{isSelf ? <em className="staff-you">You</em> : null}</strong>
                        <small>{member.email}{member.phone ? ` · ${member.phone}` : ''}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {canEdit ? (
                      <label className="staff-role-editor">
                        <Pencil size={12} aria-hidden="true" />
                        <select
                          value={member.role}
                          onChange={(event) => changeRole(member, event.target.value)}
                          disabled={isPending}
                          aria-label={`Change role for ${member.name}`}
                        >
                          {allowedRoles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                        </select>
                      </label>
                    ) : (
                      <span className="staff-role-label"><ShieldCheck size={13} aria-hidden="true" /> {displayRole(member.role)}</span>
                    )}
                  </td>
                  <td><span className={`status-badge ${statusTone(member.status)}`}><i />{member.status}</span></td>
                  <td><span className="staff-date">{formatDate(member.lastLoginAt)}</span>{!member.lastLoginAt && <small className="staff-muted">Never</small>}</td>
                  <td>
                    <span className="staff-date">{formatDate(member.invitedAt)}</span>
                    <small className="staff-muted">{member.invitedBy ? `by ${member.invitedBy}` : 'inviter unknown'}</small>
                  </td>
                  <td>
                    {isFieldRole ? (
                      <Link className="staff-zone-link" href={`/concessions/zones?assemblyId=${assemblyId}`} prefetch={false}>
                        Zones & agents <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    ) : <span className="staff-muted">—</span>}
                  </td>
                  <td>
                    <div className="staff-row-actions">
                      {canResend && (
                        <button type="button" className="icon-button" onClick={() => resend(member)} disabled={isPending} title="Resend invitation">
                          <MailPlus size={15} aria-hidden="true" /><span className="sr-only">Resend invitation</span>
                        </button>
                      )}
                      {canToggle && member.status === 'active' && (
                        <button type="button" className="icon-button danger" onClick={() => toggleActive(member)} disabled={isPending} title="Deactivate staff member">
                          <Power size={15} aria-hidden="true" /><span className="sr-only">Deactivate</span>
                        </button>
                      )}
                      {canToggle && member.status === 'deactivated' && (
                        <button type="button" className="icon-button" onClick={() => toggleActive(member)} disabled={isPending} title="Reactivate staff member">
                          <RotateCcw size={15} aria-hidden="true" /><span className="sr-only">Reactivate</span>
                        </button>
                      )}
                      {isSelf && <span className="staff-self-note">Self actions disabled</span>}
                      {!canManage && !isSelf && <span className="staff-muted">Above ceiling</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
