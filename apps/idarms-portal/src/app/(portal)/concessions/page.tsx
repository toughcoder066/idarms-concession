import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Inbox,
  Landmark,
  ReceiptText,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { getConcessionAccess } from '@/lib/access';
import {
  currentFiscalYear,
  getApprovals,
  getAssemblies,
  getAudit,
  getContracts,
  getZones,
} from '@/lib/concessions';
import { assemblyReadiness } from '@/lib/readiness';

export default async function ConcessionsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ assembly?: string; fy?: string }>;
}) {
  const params = await searchParams;
  const access = await getConcessionAccess();
  const fiscalYear = Number(params.fy) || currentFiscalYear();
  const [assemblies, contracts, approvals, audit, zones] = await Promise.all([
    getAssemblies(fiscalYear),
    getContracts(),
    getApprovals(),
    getAudit(6),
    getZones(),
  ]);
  const rows = assemblies ?? [];
  const selectedId = access.concessionWide ? params.assembly : access.assemblyId;
  const selected = rows.find((assembly) => assembly.id === selectedId)
    ?? (!access.concessionWide ? rows[0] : undefined);
  const readiness = rows.map((assembly) => ({ assembly, ...assemblyReadiness(assembly, zones ?? []) }));
  const pending = (approvals ?? []).filter((approval) => approval.status === 'PENDING');
  const readyCount = readiness.filter((item) => item.billingReady).length;
  const averageCompletion = rows.length
    ? Math.round(rows.reduce((total, row) => total + (row.totalCombinations ? (row.rateCount / row.totalCombinations) * 100 : 0), 0) / rows.length)
    : 0;
  const atRisk = readiness
    .filter((item) => !item.billingReady)
    .sort((a, b) => a.complete - b.complete)
    .slice(0, 3);
  const contract = contracts?.[0] ?? selected?.contract ?? null;
  const scopeLabel = selected ? `${selected.assemblyCode} · ${selected.assemblyName}` : 'All assemblies';

  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div>
          <p className="eyebrow">Concession management</p>
          <h1>{access.concessionWide && !selected ? 'Concession overview' : scopeLabel}</h1>
          <p>Onboarding readiness, rate governance and approvals for {access.concessionWide && !selected ? 'the whole concession' : 'this assembly'}.</p>
        </div>
        <div className="concession-heading-actions">
          {access.canManage && <Link href="/concessions/assemblies" className="button"><Building2 size={15} aria-hidden="true" /> Onboard assembly</Link>}
          <Link href="/concessions/approvals" className="button button-secondary"><Inbox size={15} aria-hidden="true" /> Approvals <span className="button-count">{pending.length}</span></Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="concession-empty">
          <span className="empty-mark"><Landmark size={22} aria-hidden="true" /></span>
          <h2>No assemblies onboarded</h2>
          <p>Create the first assembly to start readiness checks, fee-fixing and approvals.</p>
          <Link href="/concessions/assemblies" className="button">Open assembly onboarding <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      ) : (
        <>
          <div className="concession-metrics">
            <article className="concession-metric"><span className="directory-metric-icon blue"><Building2 size={17} aria-hidden="true" /></span><div><small>Assemblies in concession</small><strong>{rows.length}</strong></div><span className="metric-footnote">{readyCount} ready for billing</span></article>
            <article className="concession-metric"><span className="directory-metric-icon teal"><ClipboardCheck size={17} aria-hidden="true" /></span><div><small>Onboarding readiness</small><strong>{Math.round(readiness.reduce((total, item) => total + item.percent, 0) / Math.max(readiness.length, 1))}%</strong></div><span className="metric-footnote">Across {readiness.length} assemblies</span></article>
            <article className="concession-metric"><span className="directory-metric-icon amber"><ReceiptText size={17} aria-hidden="true" /></span><div><small>Rate configuration</small><strong>{averageCompletion}%</strong></div><span className="metric-footnote">FY {fiscalYear} combinations</span></article>
            <article className="concession-metric"><span className="directory-metric-icon violet"><Inbox size={17} aria-hidden="true" /></span><div><small>Pending approvals</small><strong>{pending.length}</strong></div><span className="metric-footnote">Dual-control requests</span></article>
          </div>

          <div className="concession-overview-grid">
            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div><span className="dashboard-section-label">READINESS WATCHLIST</span><h2>Assemblies needing attention</h2><p>Incomplete items block billing for that assembly.</p></div>
                <Link href="/concessions/assemblies" className="dashboard-text-link">View all <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
              <div className="readiness-watchlist">
                {atRisk.length === 0 ? (
                  <div className="readiness-all-clear"><CheckCircle2 size={18} aria-hidden="true" /><span><strong>All assemblies are billing-ready.</strong><small>Readiness checks are complete for FY {fiscalYear}.</small></span></div>
                ) : atRisk.map((item) => (
                  <Link key={item.assembly.id} href={`/concessions/assemblies/${item.assembly.id}`} className="readiness-watch-row">
                    <span className={`readiness-score ${item.percent >= 75 ? 'good' : item.percent >= 40 ? 'warn' : 'low'}`}>{item.complete}/{item.total}</span>
                    <span className="readiness-watch-copy"><strong>{item.assembly.assemblyName}</strong><small>{item.checks.filter((check) => !check.complete).slice(0, 2).map((check) => check.label).join(' · ') || 'Ready'}</small></span>
                    <span className="readiness-mini-track"><i style={{ width: `${item.percent}%` }} /></span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div><span className="dashboard-section-label">CONTRACT</span><h2>Revenue split</h2><p>Concession and state shares.</p></div>
                <Link href="/concessions/contracts" className="dashboard-text-link">Contracts <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
              {contract ? (
                <div className="contract-summary">
                  <div className="contract-code"><Landmark size={17} aria-hidden="true" /><span><strong>{contract.concessionCode}</strong><small>{contract.concessionName}</small></span></div>
                  <div className="split-bar" aria-label={`State ${contract.stateRevenueShare} percent, concessionaire ${contract.concessionaireShare} percent`}>
                    <span style={{ width: `${contract.concessionaireShare}%` }} />
                    <span style={{ width: `${contract.stateRevenueShare}%` }} />
                  </div>
                  <div className="split-legend"><span><i className="split-concessionaire" /> Concessionaire <strong>{contract.concessionaireShare}%</strong></span><span><i className="split-state" /> State <strong>{contract.stateRevenueShare}%</strong></span></div>
                  <div className="contract-dates"><span>Contract period</span><strong>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(contract.startDate))} — {new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(contract.endDate))}</strong></div>
                </div>
              ) : <p className="muted">No contract is linked to this concession yet.</p>}
            </section>
          </div>

          <div className="concession-overview-grid">
            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div><span className="dashboard-section-label">GOVERNANCE</span><h2>Approvals inbox</h2><p>Changes that need an explicit decision.</p></div>
                <Link href="/concessions/approvals" className="dashboard-text-link">Open inbox <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
              {pending.length === 0 ? (
                <div className="concession-inline-empty"><CheckCircle2 size={16} aria-hidden="true" /> No pending approvals in scope.</div>
              ) : pending.slice(0, 3).map((approval) => (
                <Link key={approval.id} href="/concessions/approvals" className="approval-preview-row">
                  <span className="pulse-icon amber"><ReceiptText size={15} aria-hidden="true" /></span>
                  <span><strong>{approval.assembly?.assemblyCode ?? 'Assembly'} · {approval.requestType === 'RATE_MATRIX' ? 'Rate matrix' : approval.requestType.replaceAll('_', ' ')}</strong><small>{approval.summary}</small></span>
                  <span className={`status-badge ${approval.slaDueAt < new Date().toISOString() ? 'negative' : 'pending'}`}><i />{approval.slaDueAt < new Date().toISOString() ? 'Overdue' : 'Pending'}</span>
                </Link>
              ))}
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div><span className="dashboard-section-label">RECENT ACTIVITY</span><h2>Audit ledger</h2><p>Immutable concessions activity.</p></div>
                <Link href="/concessions/audit" className="dashboard-text-link">Full ledger <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
              <div className="audit-preview-list">
                {(audit ?? []).slice(0, 5).map((record) => (
                  <div key={record.id} className="audit-preview-row">
                    <span className={`audit-dot ${record.outcome.toLowerCase()}`} />
                    <span><strong>{record.metadata.humanReadable ?? record.action.replaceAll('_', ' ')}</strong><small>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.occurredAt))}</small></span>
                  </div>
                ))}
                {(audit ?? []).length === 0 && <p className="muted">No concessions activity has been recorded yet.</p>}
              </div>
            </section>
          </div>

          <section className="concession-quick-links">
            <Link href={`/concessions/rates?fy=${fiscalYear}${selected ? `&assembly=${selected.id}` : ''}`}><span className="pulse-icon teal"><CircleDollarSign size={16} aria-hidden="true" /></span><span><strong>Fee-fixing workbench</strong><small>Configure FY{fiscalYear} rates and submit for approval</small></span><ArrowRight size={15} aria-hidden="true" /></Link>
            <Link href={`/concessions/targets?fy=${fiscalYear}${selected ? `&assembly=${selected.id}` : ''}`}><span className="pulse-icon blue"><Target size={16} aria-hidden="true" /></span><span><strong>Targets &amp; performance</strong><small>Set realistic collection targets</small></span><ArrowRight size={15} aria-hidden="true" /></Link>
            <Link href={`/concessions/zones?assembly=${selected?.id ?? ''}`}><span className="pulse-icon violet"><AlertTriangle size={16} aria-hidden="true" /></span><span><strong>Zones &amp; agents</strong><small>Review spatial coverage and field assignments</small></span><ArrowRight size={15} aria-hidden="true" /></Link>
          </section>
        </>
      )}
    </section>
  );
}
