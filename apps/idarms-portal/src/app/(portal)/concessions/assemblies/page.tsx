import { ArrowRight, Building2, CheckCircle2, CircleAlert, MapPin, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { AssemblyOnboardingForm } from '@/components/assembly-onboarding-form';
import { getConcessionAccess } from '@/lib/access';
import { currentFiscalYear, getAssemblies, getZones } from '@/lib/concessions';
import { assemblyReadiness } from '@/lib/readiness';

export default async function AssembliesPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const params = await searchParams;
  const fiscalYear = Number(params.fy) || currentFiscalYear();
  const access = await getConcessionAccess();
  const [assemblies, zones] = await Promise.all([getAssemblies(fiscalYear), getZones()]);
  const rows = (assemblies ?? []).map((assembly) => ({ assembly, readiness: assemblyReadiness(assembly, zones ?? []) }));

  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div>
          <p className="eyebrow">MMDA onboarding</p>
          <h1>Assemblies</h1>
          <p>Track each assembly from configuration to billing readiness.</p>
        </div>
        <AssemblyOnboardingForm canManage={access.canManage} />
      </div>

      {rows.length === 0 ? (
        <div className="concession-empty">
          <span className="empty-mark"><Building2 size={22} aria-hidden="true" /></span>
          <h2>No assemblies yet</h2>
          <p>Use “Onboard assembly” to create the first record and start the readiness checklist.</p>
        </div>
      ) : (
        <div className="assembly-list">
          {rows.map(({ assembly, readiness }) => (
            <article className="assembly-card" key={assembly.id}>
              <div className="assembly-card-main">
                <div className="assembly-card-identity">
                  <span className="assembly-monogram">{assembly.assemblyCode.slice(0, 3)}</span>
                  <div><h2>{assembly.assemblyName}</h2><p><MapPin size={12} aria-hidden="true" /> {assembly.region} <span>·</span> {assembly.assemblyCode}</p></div>
                </div>
                <span className={`status-badge ${readiness.billingReady ? 'positive' : assembly.status === 'ACTIVE' ? 'pending' : 'neutral'}`}><i />{readiness.billingReady ? 'Billing ready' : assembly.status === 'ACTIVE' ? 'Active · incomplete' : 'Configuring'}</span>
              </div>
              <div className="assembly-card-meta">
                <span><small>Contract</small><strong>{assembly.contract?.concessionCode ?? 'Not linked'}</strong></span>
                <span><small>Rates configured</small><strong>{assembly.rateCount}/{assembly.totalCombinations || '—'}</strong></span>
                <span><small>Revenue target</small><strong>{assembly.target ? `GHS ${assembly.target.targetAmount.toLocaleString('en-GH')}` : 'Not set'}</strong></span>
                <span><small>Field agents</small><strong><UsersRound size={12} aria-hidden="true" /> {assembly.agentCount}</strong></span>
              </div>
              <div className="assembly-card-readiness">
                <div className="assembly-readiness-label"><span>Readiness</span><strong>{readiness.complete}/{readiness.total}</strong></div>
                <div className="readiness-track"><span style={{ width: `${readiness.percent}%` }} className={readiness.percent === 100 ? 'complete' : readiness.percent >= 50 ? 'progress' : 'low'} /></div>
                <div className="assembly-readiness-checks">
                  {readiness.checks.slice(0, 4).map((check) => (
                    <span key={check.key} className={check.complete ? 'complete' : 'incomplete'}>{check.complete ? <CheckCircle2 size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}{check.label}</span>
                  ))}
                  {readiness.checks.length > 4 && <span className="more-checks">+{readiness.checks.length - 4} more</span>}
                </div>
              </div>
              <div className="assembly-card-footer">
                <span>{readiness.billingReady ? 'All prerequisites are complete. Billing can run.' : 'Billing is blocked until every readiness item is complete.'}</span>
                <Link href={`/concessions/assemblies/${assembly.id}?fy=${fiscalYear}`} className="dashboard-text-link">Open readiness <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
