import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  Inbox,
  Lock,
  ReceiptText,
  Target,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssemblyProfileForm } from '@/components/assembly-profile-form';
import { getConcessionAccess } from '@/lib/access';
import { currentFiscalYear, getAssembly, getZones } from '@/lib/concessions';
import { assemblyReadiness } from '@/lib/readiness';

export default async function AssemblyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fy?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const fiscalYear = Number(query.fy) || currentFiscalYear();
  const access = await getConcessionAccess();
  const [assembly, zones] = await Promise.all([getAssembly(id, fiscalYear), getZones()]);
  if (!assembly) notFound();
  const readiness = assemblyReadiness(assembly, zones ?? []);

  return (
    <section className="concession-page">
      <div className="entity-breadcrumb"><Link href="/concessions">Concession management</Link><span>/</span><Link href="/concessions/assemblies">Assemblies</Link><span>/</span><span>{assembly.assemblyCode}</span></div>
      <div className="concession-page-heading assembly-detail-heading">
        <div>
          <div className="assembly-detail-title">
            <span className="assembly-monogram large">{assembly.assemblyCode.slice(0, 3)}</span>
            <div><p className="eyebrow">Assembly readiness</p><h1>{assembly.assemblyName}</h1><p>{assembly.region} · {assembly.assemblyCode}{assembly.croipAssemblyId ? ` · ${assembly.croipAssemblyId}` : ''}</p></div>
          </div>
        </div>
        <div className="concession-heading-actions">
          <span className={`status-badge ${readiness.billingReady ? 'positive' : 'pending'}`}><i />{readiness.billingReady ? 'Billing ready' : 'Configuring'}</span>
          <Link href={`/concessions/rates?assembly=${assembly.id}&fy=${fiscalYear}`} className="button"><CircleDollarSign size={15} aria-hidden="true" /> Fee-fixing</Link>
        </div>
      </div>

      <div className="readiness-layout">
        <section className="readiness-card">
          <div className="readiness-card-top">
            <div><span className="dashboard-section-label">ONBOARDING READINESS</span><h2>{readiness.complete} of {readiness.total} complete</h2><p>Every item must be complete before this assembly can bill.</p></div>
            <span className={`readiness-ring ${readiness.percent === 100 ? 'complete' : ''}`}>{readiness.percent}%</span>
          </div>
          <div className="readiness-track large"><span style={{ width: `${readiness.percent}%` }} className={readiness.percent === 100 ? 'complete' : readiness.percent >= 50 ? 'progress' : 'low'} /></div>
          <div className="readiness-checklist">
            {readiness.checks.map((check) => (
              <Link key={check.key} href={check.href ?? '#'} className={`readiness-check ${check.complete ? 'complete' : 'incomplete'}`}>
                <span className="readiness-check-icon">{check.complete ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}</span>
                <span className="readiness-check-copy"><strong>{check.label}</strong><small>{check.detail}</small></span>
                {check.warning && <span className="status-badge pending"><i />Review</span>}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </div>
          {!readiness.billingReady && (
            <div className="billing-lock"><Lock size={15} aria-hidden="true" /><span><strong>Billing cannot run yet.</strong> Complete the remaining readiness items to unlock rate publication and billing.</span></div>
          )}
        </section>

        <aside className="assembly-side">
          <section className="dashboard-panel assembly-side-card">
            <div className="dashboard-panel-heading"><div><span className="dashboard-section-label">CONTRACT</span><h2>{assembly.contract?.concessionCode ?? 'Not linked'}</h2><p>{assembly.contract?.concessionName ?? 'No concession contract linked'}</p></div></div>
            {assembly.contract && <div className="assembly-side-split"><span>Concessionaire <strong>{assembly.contract.concessionaireShare}%</strong></span><span>State <strong>{assembly.contract.stateRevenueShare}%</strong></span></div>}
            <Link href="/concessions/contracts" className="dashboard-text-link">View contracts <ArrowRight size={14} aria-hidden="true" /></Link>
          </section>
          <section className="dashboard-panel assembly-side-card">
            <div className="dashboard-panel-heading"><div><span className="dashboard-section-label">FY {fiscalYear}</span><h2>Operating position</h2></div></div>
            <div className="assembly-side-stats">
              <span><ReceiptText size={14} aria-hidden="true" /> Rates<strong>{assembly.rateCount}/{assembly.totalCombinations || '—'}</strong></span>
              <span><Target size={14} aria-hidden="true" /> Target<strong>{assembly.target ? `GHS ${assembly.target.targetAmount.toLocaleString('en-GH')}` : 'Not set'}</strong></span>
              <span><UsersRound size={14} aria-hidden="true" /> Agents<strong>{assembly.agentCount}</strong></span>
              <span><Inbox size={14} aria-hidden="true" /> Pending approvals<strong>{assembly.approvals.length}</strong></span>
            </div>
          </section>
          {assembly.approvals.length > 0 && (
            <section className="dashboard-panel assembly-side-card">
              <div className="dashboard-panel-heading"><div><span className="dashboard-section-label">APPROVALS</span><h2>Waiting for a decision</h2></div></div>
              {assembly.approvals.map((approval) => (
                <Link key={approval.id} href="/concessions/approvals" className="approval-preview-row">
                  <span className="pulse-icon amber"><Clock3 size={14} aria-hidden="true" /></span>
                  <span><strong>{approval.requestType === 'RATE_MATRIX' ? 'Rate matrix' : approval.requestType.replaceAll('_', ' ')}</strong><small>{approval.summary}</small></span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>

      {access.canManage ? (
        <AssemblyProfileForm assembly={assembly} />
      ) : (
        <div className="context-strip"><span>Your role can review this assembly but not change its profile.</span></div>
      )}

      <Link href="/concessions/assemblies" className="concession-back-link"><ArrowLeft size={14} aria-hidden="true" /> Back to assemblies</Link>
    </section>
  );
}
