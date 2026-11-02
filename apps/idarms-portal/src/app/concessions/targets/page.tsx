import { ArrowRight, Target, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { TargetForm } from '@/components/target-form';
import { getConcessionAccess } from '@/lib/access';
import { currentFiscalYear, getAssemblies } from '@/lib/concessions';

function money(value: number) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(value);
}

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ assembly?: string; fy?: string }>;
}) {
  const params = await searchParams;
  const fiscalYear = Number(params.fy) || currentFiscalYear();
  const access = await getConcessionAccess();
  const assemblies = (await getAssemblies(fiscalYear)) ?? [];
  const selected = assemblies.find((assembly) => assembly.id === params.assembly)
    ?? assemblies.find((assembly) => assembly.id === access.assemblyId)
    ?? assemblies[0];
  const target = selected?.target?.targetAmount ?? null;

  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div><p className="eyebrow">Performance planning</p><h1>Targets &amp; performance</h1><p>Set realistic revenue targets for each assembly and see what they imply for the team.</p></div>
        {selected && <Link href={`/concessions/rates?assembly=${selected.id}&fy=${fiscalYear}`} className="button button-secondary">Rate schedule <ArrowRight size={14} aria-hidden="true" /></Link>}
      </div>

      {!selected ? (
        <div className="concession-empty"><span className="empty-mark"><Target size={22} aria-hidden="true" /></span><h2>No assembly selected</h2><p>Onboard an assembly to set its revenue target.</p><Link href="/concessions/assemblies" className="button">Open assemblies <ArrowRight size={14} aria-hidden="true" /></Link></div>
      ) : (
        <div className="target-layout">
          <section className="target-card">
            <div className="target-card-top">
              <div><span className="dashboard-section-label">{selected.assemblyCode} · FY {fiscalYear}</span><h2>{selected.assemblyName}</h2><p>{selected.region}</p></div>
              <span className={`status-badge ${target === null ? 'neutral' : 'positive'}`}><i />{target === null ? 'Not set' : 'Target set'}</span>
            </div>
            <div className="target-hero-value">{target === null ? '—' : money(target)}<small>annual revenue target</small></div>
            <div className="target-facts">
              <span><small>Monthly equivalent</small><strong>{target === null ? '—' : money(target / 12)}</strong></span>
              <span><small>Per assigned agent</small><strong>{target === null || selected.agentCount === 0 ? '—' : money(target / selected.agentCount)}</strong><small>{selected.agentCount} agents</small></span>
              <span><small>Rate coverage</small><strong>{selected.rateCount}/{selected.totalCombinations || '—'}</strong><small>FY {fiscalYear} combinations</small></span>
            </div>
            <div className="target-guidance"><Target size={16} aria-hidden="true" /><span>Projected billing cannot be calculated until property valuation coverage is complete. The target is stored as an operational goal, not a billing input.</span></div>
            <Link href={`/concessions/zones?assembly=${selected.id}&fy=${fiscalYear}`} className="dashboard-text-link"><UsersRound size={14} aria-hidden="true" /> Review field agent coverage <ArrowRight size={13} aria-hidden="true" /></Link>
          </section>
          <TargetForm assemblyId={selected.id} fiscalYear={fiscalYear} currentTarget={target} canManage={access.canManageTargets} />
        </div>
      )}
    </section>
  );
}
