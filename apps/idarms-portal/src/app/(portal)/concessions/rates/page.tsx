import { ArrowRight, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { RateMatrixEditor } from '@/components/rate-matrix-editor';
import { getConcessionAccess } from '@/lib/access';
import { currentFiscalYear, getAssemblies, getRateMatrix } from '@/lib/concessions';

export default async function RatesPage({
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
  const matrix = selected ? await getRateMatrix(selected.id, fiscalYear) : null;

  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div><p className="eyebrow">Rate governance</p><h1>Fee-fixing resolution</h1><p>Configure the published rate schedule, review its impact, and route it through dual-control approval.</p></div>
        <div className="concession-heading-actions">
          {selected && <Link href={`/concessions/assemblies/${selected.id}?fy=${fiscalYear}`} className="button button-secondary">Assembly readiness <ArrowRight size={14} aria-hidden="true" /></Link>}
          <Link href="/concessions/approvals" className="button"><ReceiptText size={15} aria-hidden="true" /> Approvals inbox</Link>
        </div>
      </div>

      {!selected || !matrix ? (
        <div className="concession-empty"><span className="empty-mark"><ReceiptText size={22} aria-hidden="true" /></span><h2>No assembly available</h2><p>Onboard an assembly before configuring its fee-fixing resolution.</p><Link href="/concessions/assemblies" className="button">Open assemblies <ArrowRight size={14} aria-hidden="true" /></Link></div>
      ) : (
        <>
          <div className="rate-context-card">
            <div><span className="entity-kicker"><span className="module-kicker-icon"><ReceiptText size={14} aria-hidden="true" /></span>FY {matrix.fiscalYear} RATE MATRIX</span><h2>{matrix.assembly.assemblyName}</h2><p>{matrix.assembly.region} · {matrix.assembly.assemblyCode}{matrix.assembly.contract ? ` · ${matrix.assembly.contract.concessionCode}` : ''}</p></div>
            <div className="rate-context-stats"><span><small>Configured</small><strong>{matrix.summary.configured}/{matrix.summary.total}</strong></span><span><small>Status</small><strong className={`rate-status ${matrix.summary.status.toLowerCase()}`}>{matrix.summary.status.replaceAll('_', ' ')}</strong></span></div>
          </div>
          <RateMatrixEditor matrix={matrix} canEdit={access.canEditRates} />
          <p className="directory-footnote">Rates are stored locally. Publishing emits <code>fee_fixing.published.v1</code> to billing through the transactional outbox. Concession Support can prepare drafts but cannot publish MMDA rates.</p>
        </>
      )}
    </section>
  );
}
