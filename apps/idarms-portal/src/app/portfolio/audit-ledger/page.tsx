import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ClipboardList,
  History,
  MailPlus,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { AuditHistory } from '@/components/audit/audit-history';
import { getConcessionAccess } from '@/lib/access';
import { idarmsRequest } from '@/lib/api';
import {
  auditErrorMessage,
  formatAuditTimestamp,
  type AuditActorOption,
  type AuditPage,
  type PortfolioAuditPage,
} from '@/lib/audit';
import {
  auditApiQuery,
  firstParam,
  parseAuditFilters,
  type PageSearchParams,
} from '@/lib/audit-query';
import type { AccessDirectoryEntry } from '@/lib/staff';

export default async function AuditLedgerPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const [params, access] = await Promise.all([searchParams, getConcessionAccess()]);

  if (!access.roles.includes('CONCESSION_SUPER_ADMIN')) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel">
          <span className="staff-access-icon"><ShieldAlert size={24} aria-hidden="true" /></span>
          <h1>Audit Ledger is not available</h1>
          <p>This screen is limited to Concession Super Admins. Assembly Admins use Activity &amp; Audit inside their own assembly workspace.</p>
          <Link href="/dashboard" className="button button-secondary" prefetch={false}>Back to dashboard</Link>
        </div>
      </section>
    );
  }

  const view = firstParam(params.view) === 'assembly' ? 'assembly' : 'my-actions';
  const filters = parseAuditFilters(params);
  const portfolioQuery = auditApiQuery(filters);
  const [directoryResult, portfolioResult] = await Promise.all([
    idarmsRequest<AccessDirectoryEntry[]>('concessions', '/access-directory/assemblies'),
    idarmsRequest<PortfolioAuditPage>('concessions', `/portfolio/audit?${portfolioQuery}`),
  ]);

  if (!portfolioResult.ok) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel" role="alert">
          <span className="staff-access-icon error"><AlertTriangle size={24} aria-hidden="true" /></span>
          <h1>Audit Ledger unavailable</h1>
          <p>{auditErrorMessage(portfolioResult.code, portfolioResult.message)}</p>
          <Link href="/dashboard" className="button button-secondary" prefetch={false}>Back to dashboard</Link>
        </div>
      </section>
    );
  }

  const directory = directoryResult.ok ? directoryResult.data ?? [] : [];
  const portfolio = portfolioResult.data;
  const assemblies = portfolio?.assemblies ?? [];
  const selectedAssemblyId = firstParam(params.assemblyId)
    || assemblies[0]?.assemblyId
    || directory[0]?.assemblyId
    || '';
  const selectedAssembly = assemblies.find((entry) => entry.assemblyId === selectedAssemblyId)
    ?? directory.find((entry) => entry.assemblyId === selectedAssemblyId);
  const tabsBase = '/portfolio/audit-ledger';

  let assemblyAudit: AuditPage | null = null;
  let assemblyActors: AuditActorOption[] = [];
  let assemblyError: { code?: string; message?: string } | null = null;
  if (view === 'assembly' && selectedAssemblyId) {
    const assemblyQuery = auditApiQuery(filters);
    const actorQuery = auditApiQuery({ ...filters, page: 1, actorId: undefined });
    const [auditResult, actorsResult] = await Promise.all([
      idarmsRequest<AuditPage>('concessions', `/assemblies/${selectedAssemblyId}/audit?${assemblyQuery}`),
      idarmsRequest<AuditActorOption[]>('concessions', `/assemblies/${selectedAssemblyId}/audit/actors?${actorQuery}`),
    ]);
    if (auditResult.ok) {
      assemblyAudit = auditResult.data ?? null;
      assemblyActors = actorsResult.ok ? actorsResult.data ?? [] : [];
    } else {
      assemblyError = auditResult;
    }
  }

  const summary = portfolio?.summary;
  const totalAssemblies = assemblies.length || directory.length;
  const actedAssemblies = assemblies.filter((entry) => entry.actionCount > 0);

  return (
    <section className="concession-page staff-page audit-page">
      <div className="concession-page-heading">
        <div>
          <p className="eyebrow">Concession portfolio</p>
          <h1>Audit Ledger</h1>
          <p>Your own provisioning actions across assemblies you hold a live Super Admin grant in, plus per-assembly oversight.</p>
        </div>
        <span className="staff-scope-note"><ShieldCheck size={13} aria-hidden="true" /> live portfolio grants</span>
      </div>

      <div className="audit-summary-grid">
        <article className="audit-summary-card">
          <span className="directory-metric-icon blue"><CalendarDays size={16} aria-hidden="true" /></span>
          <div><small>Your actions this week</small><strong>{summary?.actionsThisWeek ?? 0}</strong></div>
        </article>
        <article className="audit-summary-card">
          <span className="directory-metric-icon teal"><History size={16} aria-hidden="true" /></span>
          <div><small>Your actions this month</small><strong>{summary?.actionsThisMonth ?? 0}</strong></div>
        </article>
        <article className="audit-summary-card">
          <span className="directory-metric-icon violet"><Building2 size={16} aria-hidden="true" /></span>
          <div><small>Assemblies acted on</small><strong>{summary?.assembliesActedOn ?? 0}<em> / {totalAssemblies}</em></strong></div>
        </article>
        <article className="audit-summary-card">
          <span className="directory-metric-icon amber"><UsersRound size={16} aria-hidden="true" /></span>
          <div><small>No activity in 7 days</small><strong>{summary?.assembliesWithoutRecentActivity ?? 0}</strong></div>
        </article>
        <article className="audit-summary-card">
          <span className="directory-metric-icon amber"><MailPlus size={16} aria-hidden="true" /></span>
          <div><small>Invites pending &gt; 7 days</small><strong>{summary?.pendingInvitationsOlderThan7Days ?? 0}</strong></div>
        </article>
      </div>

      <div className="audit-tabs" role="tablist" aria-label="Audit ledger views">
        <Link
          href={`${tabsBase}?view=my-actions`}
          prefetch={false}
          className={view === 'my-actions' ? 'audit-tab active' : 'audit-tab'}
          role="tab"
          aria-selected={view === 'my-actions'}
        >
          <History size={15} aria-hidden="true" /> My actions
        </Link>
        <Link
          href={`${tabsBase}?view=assembly${selectedAssemblyId ? `&assemblyId=${selectedAssemblyId}` : ''}`}
          prefetch={false}
          className={view === 'assembly' ? 'audit-tab active' : 'audit-tab'}
          role="tab"
          aria-selected={view === 'assembly'}
        >
          <ClipboardList size={15} aria-hidden="true" /> Per-assembly activity
        </Link>
      </div>

      <section className="directory-card audit-portfolio-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><Building2 size={17} aria-hidden="true" /></span>
            <div>
              <h2>Assemblies you have acted on</h2>
              <p>Counts are per assembly. There is no merged cross-assembly timeline.</p>
            </div>
          </div>
          <span className="staff-scope-note">{actedAssemblies.length} of {totalAssemblies} with activity</span>
        </div>
        {assemblies.length === 0 ? (
          <div className="staff-empty">
            <span className="empty-mark"><Building2 size={22} aria-hidden="true" /></span>
            <h3>No assemblies in scope</h3>
            <p>No live CONCESSION_SUPER_ADMIN grants were found for your identity.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="directory-table staff-table audit-assembly-table">
              <thead>
                <tr>
                  <th>Assembly</th>
                  <th>Your actions</th>
                  <th>Last action</th>
                  <th>Oversight</th>
                </tr>
              </thead>
              <tbody>
                {assemblies.map((entry) => (
                  <tr key={entry.assemblyId}>
                    <td>
                      <div className="record-primary staff-identity">
                        <span className="record-avatar building-avatar"><Building2 size={15} aria-hidden="true" /></span>
                        <span>
                          <strong>{entry.assemblyName ?? entry.assemblyId}</strong>
                          <small>{entry.assemblyCode ?? '—'}</small>
                        </span>
                      </div>
                    </td>
                    <td><span className="audit-assembly-count">{entry.actionCount}</span></td>
                    <td><span className="audit-when">{entry.lastActionAt ? formatAuditTimestamp(entry.lastActionAt) : 'No actions yet'}</span></td>
                    <td>
                      <Link
                        href={`${tabsBase}?view=assembly&assemblyId=${entry.assemblyId}`}
                        className="dashboard-text-link"
                        prefetch={false}
                      >
                        Open activity <ArrowUpRight size={13} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {view === 'my-actions' ? (
        <AuditHistory
          basePath={tabsBase}
          filters={filters}
          actors={[]}
          entries={portfolio?.items ?? []}
          total={portfolio?.total ?? 0}
          showActorFilter={false}
          showAssemblyColumn
          hiddenParams={{ view: 'my-actions' }}
          scopeNote="Your own actions across authorized assemblies. Select an assembly to see its full activity."
          emptyMessage="You have not taken any provisioning actions matching these filters."
        />
      ) : !selectedAssemblyId ? (
        <div className="staff-empty audit-empty">
          <span className="empty-mark"><ClipboardList size={22} aria-hidden="true" /></span>
          <h3>Select an assembly</h3>
          <p>Choose an assembly above to view its Activity &amp; Audit history.</p>
        </div>
      ) : assemblyError ? (
        <div className="staff-access-panel" role="alert">
          <span className="staff-access-icon error"><AlertTriangle size={24} aria-hidden="true" /></span>
          <h1>Assembly activity unavailable</h1>
          <p>{auditErrorMessage(assemblyError.code, assemblyError.message)}</p>
        </div>
      ) : (
        <>
          <form method="get" action={tabsBase} className="audit-assembly-picker">
            <input type="hidden" name="view" value="assembly" />
            <label className="field">
              Assembly context
              <select name="assemblyId" defaultValue={selectedAssemblyId}>
                {assemblies.map((entry) => (
                  <option key={entry.assemblyId} value={entry.assemblyId}>
                    {entry.assemblyName ?? entry.assemblyId}{entry.assemblyCode ? ` (${entry.assemblyCode})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="button button-compact">Open assembly</button>
          </form>
          <AuditHistory
            basePath={tabsBase}
            filters={filters}
            actors={assemblyActors}
            entries={assemblyAudit?.items ?? []}
            total={assemblyAudit?.total ?? 0}
            showActorFilter
            showAssemblyColumn={false}
            hiddenParams={{ view: 'assembly', assemblyId: selectedAssemblyId }}
            scopeNote={`${selectedAssembly?.assemblyName ?? selectedAssemblyId} activity, newest first. Same view the Assembly Admin sees.`}
            emptyMessage="No provisioning activity matches these filters for this assembly."
          />
        </>
      )}
    </section>
  );
}
