import { ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { ZonesAgentsManager } from '@/components/zones-agents-manager';
import { getConcessionAccess } from '@/lib/access';
import { currentFiscalYear, getAgents, getAssemblies, getZones } from '@/lib/concessions';

export default async function ZonesPage({
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
  const [allZones, agents] = await Promise.all([
    getZones(),
    selected ? getAgents(selected.id) : Promise.resolve([]),
  ]);
  const zones = (allZones ?? []).filter((zone) => zone.assemblyId === selected?.id);

  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div><p className="eyebrow">Field operations</p><h1>Zones &amp; agents</h1><p>Review spatial coverage and assign field agents to the assembly.</p></div>
        <div className="concession-heading-actions"><Link href={`/concessions/assemblies/${selected?.id ?? ''}?fy=${fiscalYear}`} className="button button-secondary">Readiness <ArrowRight size={14} aria-hidden="true" /></Link></div>
      </div>
      {!selected ? (
        <div className="concession-empty"><span className="empty-mark"><MapPin size={22} aria-hidden="true" /></span><h2>No assembly selected</h2><p>Onboard an assembly to manage its zones and field agents.</p><Link href="/concessions/assemblies" className="button">Open assemblies <ArrowRight size={14} aria-hidden="true" /></Link></div>
      ) : (
        <ZonesAgentsManager assemblyId={selected.id} assemblyName={selected.assemblyName} zones={zones} agents={agents ?? []} canManage={access.canManageAgents} />
      )}
    </section>
  );
}
