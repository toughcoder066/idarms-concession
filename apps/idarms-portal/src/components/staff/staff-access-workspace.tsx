'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  FileSpreadsheet,
  MailPlus,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserRound,
  UserX,
  UsersRound,
} from 'lucide-react';
import { BulkImportModal } from './bulk-import-modal';
import { InviteStaffModal } from './invite-staff-modal';
import { StaffNotifications } from './staff-notifications';
import { StaffTable } from './staff-table';
import type {
  StaffMember,
  StaffNotification,
  StaffRoleOption,
} from '@/lib/staff';

interface AssemblyOption {
  assemblyId: string;
  assemblyName: string | null;
  assemblyCode: string | null;
}

export function StaffAccessWorkspace({
  assemblyId,
  assemblyName,
  assemblyCode,
  staff,
  assemblyOptions,
  canSwitchAssemblies,
  actorRole,
  allowedRoles,
  currentUserId,
  notifications,
  isSuperAdmin,
}: {
  assemblyId: string;
  assemblyName: string;
  assemblyCode: string;
  staff: StaffMember[];
  assemblyOptions: AssemblyOption[];
  canSwitchAssemblies: boolean;
  actorRole: 'CONCESSION_SUPER_ADMIN' | 'ASSEMBLY_ADMIN';
  allowedRoles: StaffRoleOption[];
  currentUserId?: string;
  notifications: StaffNotification[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const counts = {
    total: staff.length,
    active: staff.filter((member) => member.status === 'active').length,
    invited: staff.filter((member) => member.status === 'invited').length,
    deactivated: staff.filter((member) => member.status === 'deactivated').length,
  };

  const visibleNotifications = isSuperAdmin && currentUserId
    ? notifications.filter((notification) => notification.actorId === currentUserId)
    : notifications;

  return (
    <section className="concession-page staff-page">
      <div className="concession-page-heading staff-page-heading">
        <div>
          <p className="eyebrow">{isSuperAdmin ? 'Concession portfolio · assembly context' : 'Assembly administration'}</p>
          <h1>Staff &amp; Access</h1>
          <p>{assemblyName} · {assemblyCode} · staff identities and assembly-scoped ZITADEL grants.</p>
        </div>
        <div className="staff-toolbar">
          {canSwitchAssemblies && (
            <label className="assembly-switcher">
              <span>Assembly</span>
              <select
                value={assemblyId}
                onChange={(event) => router.push(`/assembly/${event.target.value}/staff-access`)}
                aria-label="Switch assembly"
              >
                {assemblyOptions.map((option) => (
                  <option key={option.assemblyId} value={option.assemblyId}>
                    {option.assemblyName ?? option.assemblyId}{option.assemblyCode ? ` (${option.assemblyCode})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="staff-toolbar-actions">
            <button type="button" className="button button-secondary button-compact" onClick={() => setBulkOpen(true)}>
              <FileSpreadsheet size={14} aria-hidden="true" /> Bulk import
            </button>
            <button type="button" className="button button-compact" onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} aria-hidden="true" /> Invite staff
            </button>
          </div>
        </div>
      </div>

      <div className="directory-metrics staff-metrics">
        <article className="directory-metric"><span className="directory-metric-icon blue"><UsersRound size={16} aria-hidden="true" /></span><div><small>Total staff</small><strong>{counts.total}</strong></div></article>
        <article className="directory-metric"><span className="directory-metric-icon teal"><UserCheck size={16} aria-hidden="true" /></span><div><small>Active</small><strong>{counts.active}</strong></div></article>
        <article className="directory-metric"><span className="directory-metric-icon amber"><MailPlus size={16} aria-hidden="true" /></span><div><small>Invited</small><strong>{counts.invited}</strong></div></article>
        <article className="directory-metric"><span className="directory-metric-icon violet"><UserX size={16} aria-hidden="true" /></span><div><small>Deactivated</small><strong>{counts.deactivated}</strong></div></article>
      </div>

      <section className="directory-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><UserRound size={17} aria-hidden="true" /></span>
            <div>
              <h2>Staff directory</h2>
              <p>{counts.total} accounts · actions are limited to your current provision ceiling</p>
            </div>
          </div>
          <span className="staff-scope-note"><ShieldCheck size={13} aria-hidden="true" /> {actorRole.replaceAll('_', ' ').toLowerCase()}</span>
        </div>
        <StaffTable
          assemblyId={assemblyId}
          staff={staff}
          actorRole={actorRole}
          allowedRoles={allowedRoles}
          currentUserId={currentUserId}
          onChanged={() => router.refresh()}
        />
      </section>

      <StaffNotifications
        notifications={visibleNotifications}
        title={isSuperAdmin ? 'Your recent actions in this assembly' : 'Assembly notifications'}
        description={isSuperAdmin
          ? 'A transparency record of actions you performed on this assembly.'
          : 'Actions taken by Concession Super Admins in this assembly.'}
      />

      <InviteStaffModal
        open={inviteOpen}
        assemblyId={assemblyId}
        assemblyName={assemblyName}
        roleOptions={allowedRoles}
        onClose={() => setInviteOpen(false)}
        onInvited={() => router.refresh()}
      />
      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        fixedAssemblyId={assemblyId}
        fixedAssemblyName={`${assemblyName} (${assemblyCode})`}
        onCommitted={() => router.refresh()}
      />
    </section>
  );
}
