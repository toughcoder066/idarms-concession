import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  LockKeyhole,
  LogOut,
  MailPlus,
  Pencil,
  Power,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import {
  auditActorKind,
  getRoleDefinition,
} from '@idarms/contracts';
import { exitPreviewAction } from '@/app/(portal)/preview/exit-actions';
import {
  getPreviewFixture,
  type PreviewAuditRow,
  type PreviewStaffRow,
  type PreviewFixture,
} from '@/lib/preview-fixtures';
import type { PreviewPersonaKey } from '@idarms/contracts';

function formatPreviewDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function roleLabel(role: string): string {
  return getRoleDefinition(role)?.displayName
    ?? role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(status: PreviewStaffRow['status']): string {
  if (status === 'active') return 'positive';
  if (status === 'invited') return 'pending';
  return 'negative';
}

function PreviewDisabledButton({
  children,
  icon,
  compact = true,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <span className="preview-disabled-control" title="Disabled in preview mode">
      <button
        type="button"
        className={`button button-secondary ${compact ? 'button-compact' : ''}`}
        disabled
        aria-disabled="true"
      >
        {icon}
        {children}
      </button>
    </span>
  );
}

function PreviewDisabledIcon({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <span className="preview-disabled-control" title="Disabled in preview mode">
      <button type="button" className="icon-button" disabled aria-disabled="true" title="Disabled in preview mode">
        {icon}
        <span className="sr-only">{label} — disabled in preview mode</span>
      </button>
    </span>
  );
}

function actorBadge(role: string): { kind: string; label: string } {
  return {
    kind: auditActorKind(role),
    label: role === 'CONCESSION_SUPER_ADMIN' ? 'Super Admin' : roleLabel(role),
  };
}

function PreviewAuditTable({ rows }: { rows: PreviewAuditRow[] }) {
  return (
    <div className="table-wrap">
      <table className="directory-table staff-table preview-audit-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Outcome</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = actorBadge(row.actorRole);
            return (
              <tr key={row.id}>
                <td><span className="audit-when">{formatPreviewDate(row.occurredAt)}</span></td>
                <td>
                  <div className="audit-actor">
                    <strong>{row.actorName}</strong>
                    <span className={`audit-actor-badge ${badge.kind}`}>{badge.label}</span>
                  </div>
                </td>
                <td>
                  <span className="audit-action">{row.actionLabel}</span>
                  <small className="audit-action-code">{row.action}</small>
                </td>
                <td><span className="audit-target">{row.target}</span></td>
                <td><span className={`status-badge ${row.outcome === 'SUCCESS' ? 'positive' : 'negative'}`}><i />{row.outcome}</span></td>
                <td><span className="audit-description">{row.description}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PreviewStaffTable({ fixture }: { fixture: PreviewFixture }) {
  return (
    <>
      <div className="preview-toolbar">
        <PreviewDisabledButton icon={<FileSpreadsheet size={14} aria-hidden="true" />}>Bulk import</PreviewDisabledButton>
        <PreviewDisabledButton icon={<UserPlus size={14} aria-hidden="true" />}>Invite staff</PreviewDisabledButton>
        <span className="preview-lock-note"><LockKeyhole size={12} aria-hidden="true" /> All controls are disabled in preview mode</span>
      </div>
      <div className="table-wrap">
        <table className="directory-table staff-table preview-staff-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th>Invitation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fixture.staff.map((member) => (
              <tr key={member.email}>
                <td>
                  <div className="record-primary staff-identity">
                    <span className="record-avatar">{member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="preview-disabled-control" title="Disabled in preview mode">
                    <select className="preview-role-select" defaultValue={member.role} disabled aria-disabled="true" title="Disabled in preview mode">
                      <option value={member.role}>{roleLabel(member.role)}</option>
                    </select>
                  </span>
                </td>
                <td><span className={`status-badge ${statusTone(member.status)}`}><i />{member.status}</span></td>
                <td><span className="staff-date">{formatPreviewDate(member.lastLoginAt)}</span></td>
                <td><span className="staff-date">{formatPreviewDate(member.invitedAt)}</span></td>
                <td>
                  <div className="staff-row-actions">
                    <PreviewDisabledIcon label="Edit role" icon={<Pencil size={15} aria-hidden="true" />} />
                    <PreviewDisabledIcon label="Deactivate" icon={<Power size={15} aria-hidden="true" />} />
                    {member.status === 'invited' && (
                      <PreviewDisabledIcon label="Resend invite" icon={<MailPlus size={15} aria-hidden="true" />} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!fixture.canManageStaff && (
        <div className="preview-readonly-note">
          <ShieldCheck size={13} aria-hidden="true" />
          This persona has read-only staff visibility. Management actions are not available.
        </div>
      )}
    </>
  );
}

export function PreviewWorkspace({ persona }: { persona: PreviewPersonaKey }) {
  const fixture = getPreviewFixture(persona);

  return (
    <section className="concession-page staff-page preview-page">
      <div className="preview-banner" role="status" aria-live="polite">
        <div className="preview-banner-copy">
          <span className="preview-banner-icon"><Eye size={17} aria-hidden="true" /></span>
          <span>
            <strong>PREVIEW MODE</strong>
            <span>Simulated {fixture.label} view. No real data. Read-only.</span>
          </span>
        </div>
        <form action={exitPreviewAction}>
          <button type="submit" className="preview-exit">
            <LogOut size={14} aria-hidden="true" /> Exit preview
          </button>
        </form>
      </div>

      <div className="concession-page-heading preview-heading">
        <div>
          <p className="eyebrow">Simulated assembly workspace</p>
          <h1>{fixture.assemblyName}</h1>
          <p>{fixture.label} · {fixture.concessionName} · {fixture.assemblyCode} · static fixture</p>
        </div>
        <span className="preview-simulation-badge"><Eye size={13} aria-hidden="true" /> SIMULATED</span>
      </div>

      <div className="preview-disclaimer">
        <AlertTriangle size={14} aria-hidden="true" />
        <p>
          Every name, email, number, and audit entry on this page is generated fixture data.
          Nothing here is read from ZITADEL, the iDARMS database, or any real assembly.
        </p>
      </div>

      <div className="audit-summary-grid preview-metrics">
        {fixture.metrics.map((metric) => (
          <article className="audit-summary-card" key={metric.label}>
            <span className="directory-metric-icon blue"><Activity size={16} aria-hidden="true" /></span>
            <div>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <em>{metric.hint}</em>
            </div>
          </article>
        ))}
      </div>

      <section className="directory-card preview-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><UsersRound size={17} aria-hidden="true" /></span>
            <div>
              <h2>Staff &amp; Access</h2>
              <p>{fixture.scopeNote} · fixture directory</p>
            </div>
          </div>
          <span className="staff-scope-note"><LockKeyhole size={13} aria-hidden="true" /> read-only simulation</span>
        </div>
        <PreviewStaffTable fixture={fixture} />
      </section>

      <section className="directory-card preview-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><ClipboardList size={17} aria-hidden="true" /></span>
            <div>
              <h2>Activity &amp; Audit</h2>
              <p>Fixture audit trail for {fixture.assemblyName} · {fixture.audit.length} simulated entries</p>
            </div>
          </div>
          <span className="staff-scope-note"><Eye size={13} aria-hidden="true" /> demo only</span>
        </div>
        <PreviewAuditTable rows={fixture.audit} />
      </section>

      <section className="directory-card preview-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><Building2 size={17} aria-hidden="true" /></span>
            <div>
              <h2>What this persona sees</h2>
              <p>{fixture.description}</p>
            </div>
          </div>
        </div>
        <div className="preview-capability-list">
          {fixture.capabilities.map((capability) => (
            <span key={capability}><ShieldCheck size={13} aria-hidden="true" /> {capability}</span>
          ))}
        </div>
      </section>

      <div className="preview-footer">
        <span><Eye size={13} aria-hidden="true" /> Simulation only — no real identity or data.</span>
        <form action={exitPreviewAction}>
          <button type="submit" className="button button-secondary button-compact">
            <ArrowLeft size={14} aria-hidden="true" /> Exit preview
          </button>
        </form>
      </div>
    </section>
  );
}
