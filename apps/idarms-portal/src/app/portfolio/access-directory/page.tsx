import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Clock3,
  MailPlus,
  ShieldAlert,
  UsersRound,
  UserX,
} from 'lucide-react';
import { auth } from '@/auth';
import { BulkImportLauncher } from '@/components/staff/bulk-import-launcher';
import { PreviewExperienceButton } from '@/components/preview/preview-experience-button';
import { getConcessionAccess } from '@/lib/access';
import { idarmsRequest } from '@/lib/api';
import {
  staffErrorMessage,
  type AccessDirectoryEntry,
  type StaffMember,
  type StaffNotification,
} from '@/lib/staff';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function latestDate(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value && (!latest || value > latest)) latest = value;
  }
  return latest;
}

export default async function AccessDirectoryPage() {
  const [access, session] = await Promise.all([getConcessionAccess(), auth()]);

  if (!access.roles.includes('CONCESSION_SUPER_ADMIN')) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel">
          <span className="staff-access-icon"><ShieldAlert size={24} aria-hidden="true" /></span>
          <h1>Access Directory is not available</h1>
          <p>This screen is limited to Concession Super Admins. Assembly Admins manage staff from their own assembly workspace.</p>
          <Link href="/dashboard" className="button button-secondary" prefetch={false}>Back to dashboard</Link>
        </div>
      </section>
    );
  }

  const directory = await idarmsRequest<AccessDirectoryEntry[]>('concessions', '/access-directory/assemblies');
  if (!directory.ok) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel" role="alert">
          <span className="staff-access-icon error"><AlertTriangle size={24} aria-hidden="true" /></span>
          <h1>Access Directory unavailable</h1>
          <p>{staffErrorMessage(directory.code, directory.message)}</p>
          <Link href="/dashboard" className="button button-secondary" prefetch={false}>Back to dashboard</Link>
        </div>
      </section>
    );
  }

  const entries = directory.data ?? [];
  const details = await Promise.all(entries.map(async (entry) => {
    const [staffResult, notificationsResult] = await Promise.all([
      idarmsRequest<StaffMember[]>('concessions', `/assemblies/${entry.assemblyId}/staff`),
      idarmsRequest<StaffNotification[]>('concessions', `/assemblies/${entry.assemblyId}/staff/notifications`),
    ]);
    return {
      entry,
      staff: staffResult.ok ? staffResult.data ?? [] : [],
      notifications: notificationsResult.ok ? notificationsResult.data ?? [] : [],
      staffError: staffResult.ok ? null : staffResult,
    };
  }));

  const metrics = details.reduce((accumulator, detail) => {
    accumulator.active += detail.staff.filter((member) => member.status === 'active').length;
    accumulator.invited += detail.staff.filter((member) => member.status === 'invited').length;
    accumulator.deactivated += detail.staff.filter((member) => member.status === 'deactivated').length;
    return accumulator;
  }, { active: 0, invited: 0, deactivated: 0 });

  const myActions = details
    .flatMap((detail) => detail.notifications
      .filter((notification) => session?.userId && notification.actorId === session.userId)
      .map((notification) => ({
        ...notification,
        assemblyName: detail.entry.assemblyName ?? detail.entry.assemblyId,
      })))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const assemblyOptions = entries.map((entry) => ({
    assemblyId: entry.assemblyId,
    assemblyName: entry.assemblyName,
    assemblyCode: entry.assemblyCode,
  }));

  return (
    <section className="concession-page staff-page">
      <div className="concession-page-heading">
        <div>
          <p className="eyebrow">Concession portfolio</p>
          <h1>Access Directory</h1>
          <p>Assemblies where your ZITADEL identity currently holds a live CONCESSION_SUPER_ADMIN grant.</p>
        </div>
        <div className="staff-toolbar-actions">
          {(access.roles.includes('CONCESSION_SUPER_ADMIN') || access.roles.includes('PLATFORM_ADMIN')) && (
            <PreviewExperienceButton />
          )}
          {entries.length > 0 && <BulkImportLauncher assemblyOptions={assemblyOptions} label="Bulk import" />}
        </div>
      </div>

      <div className="directory-metrics staff-metrics">
        <article className="directory-metric"><span className="directory-metric-icon blue"><Building2 size={16} aria-hidden="true" /></span><div><small>Assemblies in scope</small><strong>{entries.length}</strong></div></article>
        <article className="directory-metric"><span className="directory-metric-icon teal"><UsersRound size={16} aria-hidden="true" /></span><div><small>Active staff</small><strong>{metrics.active}</strong></div></article>
        <article className="directory-metric"><span className="directory-metric-icon amber"><MailPlus size={16} aria-hidden="true" /></span><div><small>Invited / pending</small><strong>{metrics.invited}</strong></div></article>
        <article className="directory-metric"><span className="directory-metric-icon violet"><UserX size={16} aria-hidden="true" /></span><div><small>Deactivated</small><strong>{metrics.deactivated}</strong></div></article>
      </div>

      <section className="directory-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><Building2 size={17} aria-hidden="true" /></span>
            <div>
              <h2>Assemblies</h2>
              <p>Select an assembly to open its staff directory. No cross-assembly staff listing is shown.</p>
            </div>
          </div>
          <span className="staff-scope-note"><Activity size={13} aria-hidden="true" /> live grants</span>
        </div>

        {entries.length === 0 ? (
          <div className="staff-empty">
            <span className="empty-mark"><Building2 size={22} aria-hidden="true" /></span>
            <h3>No assembly grants yet</h3>
            <p>Once an assembly is onboarded and your Super Admin grant is created there, it will appear here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="directory-table staff-table access-directory-table">
              <thead>
                <tr>
                  <th>Assembly</th>
                  <th>Active staff</th>
                  <th>Invited / pending</th>
                  <th>Deactivated</th>
                  <th>Last activity</th>
                  <th>Staff directory</th>
                </tr>
              </thead>
              <tbody>
                {details.map(({ entry, staff, notifications, staffError }) => {
                  const active = staff.filter((member) => member.status === 'active').length;
                  const invited = staff.filter((member) => member.status === 'invited').length;
                  const deactivated = staff.filter((member) => member.status === 'deactivated').length;
                  const lastActivity = latestDate([
                    ...staff.map((member) => member.lastLoginAt),
                    ...notifications.map((notification) => notification.createdAt),
                  ]);
                  return (
                    <tr key={entry.assemblyId}>
                      <td>
                        <div className="record-primary staff-identity">
                          <span className="record-avatar building-avatar"><Building2 size={15} aria-hidden="true" /></span>
                          <span>
                            <strong>{entry.assemblyName ?? entry.assemblyId}</strong>
                            <small>{entry.assemblyCode ?? '—'} · {entry.primaryDomain ?? entry.orgId}</small>
                          </span>
                        </div>
                      </td>
                      <td>{staffError ? <span className="status-badge negative"><i />Access issue</span> : <strong className="staff-count">{active}</strong>}</td>
                      <td><strong className="staff-count">{invited}</strong></td>
                      <td><strong className="staff-count">{deactivated}</strong></td>
                      <td><span className="staff-date">{formatDate(lastActivity)}</span></td>
                      <td>
                        <Link href={`/assembly/${entry.assemblyId}/staff-access`} prefetch={false} className="dashboard-text-link">
                          Open staff <ArrowUpRight size={13} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="directory-card staff-notifications">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><Clock3 size={17} aria-hidden="true" /></span>
            <div>
              <h2>Your recent actions across assemblies</h2>
              <p>Transparency log of Super Admin actions recorded in assembly notification rows.</p>
            </div>
          </div>
          <span className="staff-notification-count">{myActions.length}</span>
        </div>
        {myActions.length === 0 ? (
          <div className="staff-notification-empty">No actions recorded yet. Invite or update staff inside an assembly to create a transparency entry.</div>
        ) : (
          <ul className="staff-notification-list">
            {myActions.slice(0, 12).map((notification) => (
              <li key={notification.id}>
                <span className="staff-notification-icon"><Building2 size={14} aria-hidden="true" /></span>
                <div>
                  <strong>{notification.assemblyName} · {notification.message}</strong>
                  <small>{formatDate(notification.createdAt)}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
