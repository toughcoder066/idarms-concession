import { ArrowRight, Building2, FileSignature, Landmark } from 'lucide-react';
import Link from 'next/link';
import { ContractForm } from '@/components/contract-form';
import { getConcessionAccess } from '@/lib/access';
import { getAssemblies, getContracts, currentFiscalYear } from '@/lib/concessions';

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const params = await searchParams;
  const fiscalYear = Number(params.fy) || currentFiscalYear();
  const access = await getConcessionAccess();
  const [contracts, assemblies] = await Promise.all([getContracts(), getAssemblies(fiscalYear)]);
  const contract = contracts?.[0] ?? null;
  const linked = assemblies ?? [];

  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div><p className="eyebrow">Concession governance</p><h1>Contracts &amp; splits</h1><p>The concession contract defines the revenue share and the assemblies in scope.</p></div>
      </div>

      {contract ? (
        <div className="contract-page-grid">
          <section className="contract-overview-card">
            <div className="contract-overview-top">
              <span className="contract-emblem"><FileSignature size={22} aria-hidden="true" /></span>
              <div><span className="dashboard-section-label">CONCESSION CONTRACT</span><h2>{contract.concessionCode}</h2><p>{contract.concessionName}</p></div>
              <span className={`status-badge ${contract.isActive ? 'positive' : 'neutral'}`}><i />{contract.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="contract-split-large">
              <div><span>Concessionaire</span><strong>{contract.concessionaireShare}%</strong></div>
              <div className="split-bar"><span style={{ width: `${contract.concessionaireShare}%` }} /><span style={{ width: `${contract.stateRevenueShare}%` }} /></div>
              <div><span>State</span><strong>{contract.stateRevenueShare}%</strong></div>
            </div>
            <div className="contract-facts">
              <span><small>Contract period</small><strong>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(contract.startDate))} — {new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(contract.endDate))}</strong></span>
              <span><small>Assemblies in scope</small><strong>{contract.assemblyCount ?? linked.length}</strong></span>
              <span><small>Contract ID</small><strong className="mono-value">{contract.id}</strong></span>
            </div>
          </section>
          <ContractForm contract={contract} canManage={access.canManage} />
        </div>
      ) : (
        <div className="contract-page-grid">
          <div className="concession-empty"><span className="empty-mark"><Landmark size={22} aria-hidden="true" /></span><h2>No contract linked</h2><p>Create the concession contract to establish the revenue split and assembly scope.</p></div>
          <ContractForm contract={null} canManage={access.canManage} />
        </div>
      )}

      <section className="directory-card contract-assemblies-card">
        <div className="directory-heading"><div className="directory-title"><span className="directory-title-icon"><Building2 size={17} aria-hidden="true" /></span><div><h2>Assemblies in this concession</h2><p>{linked.length} assemblies linked through the contract</p></div></div><Link href="/concessions/assemblies" className="dashboard-text-link">Manage assemblies <ArrowRight size={14} aria-hidden="true" /></Link></div>
        {linked.length === 0 ? (
          <div className="concession-inline-empty"><Building2 size={16} aria-hidden="true" /> No assemblies are linked yet. Onboard an assembly to add it to this contract.</div>
        ) : (
          <div className="contract-assembly-list">
            {linked.map((assembly) => (
              <Link key={assembly.id} href={`/concessions/assemblies/${assembly.id}?fy=${fiscalYear}`} className="contract-assembly-row">
                <span className="assembly-monogram small">{assembly.assemblyCode.slice(0, 3)}</span>
                <span><strong>{assembly.assemblyName}</strong><small>{assembly.region} · {assembly.assemblyCode}</small></span>
                <span className={`status-badge ${assembly.status === 'ACTIVE' ? 'positive' : 'neutral'}`}><i />{assembly.status.toLowerCase()}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
