'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Filter,
  Lock,
  Save,
  Send,
  X,
} from 'lucide-react';
import { saveRatesAction, submitRatesAction } from '@/app/(portal)/concessions/actions';
import type { RateMatrix, RateRow } from '@/lib/concessions';

type EditableRow = RateRow & {
  draftBaseRate: string;
  draftRateImpost: string;
  draftMinimumLevy: string;
};

function toEditable(row: RateRow): EditableRow {
  return {
    ...row,
    draftBaseRate: row.baseRate === null ? '' : String(row.baseRate),
    draftRateImpost: row.rateImpost === null ? '' : String(Number((row.rateImpost * 100).toFixed(4))),
    draftMinimumLevy: row.minimumLevy === null ? '' : String(row.minimumLevy),
  };
}

function money(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(value);
}

function changeLabel(value: number | null) {
  if (value === null) return <span className="rate-change neutral">—</span>;
  if (Math.abs(value) < 0.01) return <span className="rate-change neutral">= 0.0%</span>;
  return <span className={`rate-change ${value > 0 ? 'up' : 'down'}`}>{value > 0 ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%</span>;
}

export function RateMatrixEditor({
  matrix,
  canEdit,
}: {
  matrix: RateMatrix;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<EditableRow[]>(() => matrix.rows.map(toEditable));
  const [filter, setFilter] = useState<'all' | 'unconfigured' | 'changed'>('all');
  const [query, setQuery] = useState('');
  const [impactOpen, setImpactOpen] = useState(false);
  const [pending, setPending] = useState<'save' | 'submit' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  const locked = !canEdit || matrix.summary.status === 'PENDING_APPROVAL' || matrix.summary.status === 'PUBLISHED';
  const visible = useMemo(() => rows.filter((row) => {
    const matchesQuery = !query || `${row.propertyTypeCode} ${row.propertyUsageCode} ${row.propertyTypeName} ${row.propertyUsageName}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all'
      || (filter === 'unconfigured' && row.draftBaseRate === '')
      || (filter === 'changed' && row.changePct !== null && Math.abs(row.changePct) > 0.01);
    return matchesQuery && matchesFilter;
  }), [filter, query, rows]);
  const configured = rows.filter((row) => row.draftBaseRate !== '' && row.draftRateImpost !== '');
  const unconfigured = rows.length - configured.length;

  function updateRow(index: number, field: 'draftBaseRate' | 'draftRateImpost' | 'draftMinimumLevy', value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
    setResult(null);
  }

  async function save() {
    if (locked) return;
    if (configured.length === 0) {
      setResult({ ok: false, message: 'Enter at least one rate before saving.' });
      return;
    }
    setPending('save');
    setResult(null);
    const response = await saveRatesAction({
      assemblyId: matrix.assembly.id,
      fiscalYear: matrix.fiscalYear,
      rows: configured.map((row) => ({
        propertyTypeId: row.propertyTypeId,
        propertyUsageId: row.propertyUsageId,
        baseRate: Number(row.draftBaseRate),
        rateImpost: Number(row.draftRateImpost) / 100,
        minimumLevy: Number(row.draftMinimumLevy || 0),
      })),
    });
    setResult(response);
    setPending(null);
    if (response.ok) {
      setRows((current) => current.map((row) => (
        row.draftBaseRate !== '' && row.draftRateImpost !== ''
          ? {
            ...row,
            baseRate: Number(row.draftBaseRate),
            rateImpost: Number(row.draftRateImpost) / 100,
            minimumLevy: Number(row.draftMinimumLevy || 0),
            status: 'DRAFT',
            publishedAt: null,
          }
          : row
      )));
      router.refresh();
    }
  }

  async function submit() {
    setPending('submit');
    setResult(null);
    const response = await submitRatesAction({ assemblyId: matrix.assembly.id, fiscalYear: matrix.fiscalYear });
    setResult(response);
    setPending(null);
    if (response.ok) router.refresh();
  }

  return (
    <>
      <div className="rate-workbench">
        <div className="rate-workbench-toolbar">
          <div className="rate-filters">
            <label className="search-field"><Filter size={15} aria-hidden="true" /><input type="search" value={query} placeholder="Filter property type or usage" onChange={(event) => setQuery(event.target.value)} aria-label="Filter rate rows" /></label>
            <div className="rate-filter-tabs">
              <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{rows.length}</span></button>
              <button type="button" className={filter === 'unconfigured' ? 'active' : ''} onClick={() => setFilter('unconfigured')}>Unconfigured <span>{unconfigured}</span></button>
              <button type="button" className={filter === 'changed' ? 'active' : ''} onClick={() => setFilter('changed')}>Changed</button>
            </div>
          </div>
          <div className="rate-workbench-actions">
            <button type="button" className="button button-secondary" onClick={() => setImpactOpen(true)}><AlertTriangle size={14} aria-hidden="true" /> Impact analysis</button>
            <button type="button" className="button" onClick={save} disabled={locked || pending !== null}><Save size={14} aria-hidden="true" /> {pending === 'save' ? 'Saving…' : 'Save draft'}</button>
            <button type="button" className="button button-blue" onClick={submit} disabled={locked || pending !== null || configured.length === 0}><Send size={14} aria-hidden="true" /> {pending === 'submit' ? 'Submitting…' : 'Submit for approval'}</button>
          </div>
        </div>

        <div className="rate-status-strip">
          <div><span>Completion</span><strong>{configured.length}/{matrix.summary.total}</strong><span className="rate-mini-track"><i style={{ width: `${matrix.summary.total ? Math.round((configured.length / matrix.summary.total) * 100) : 0}%` }} /></span></div>
          <div><span>Status</span><strong className={`rate-status ${matrix.summary.status.toLowerCase()}`}>{matrix.summary.status.replaceAll('_', ' ')}</strong></div>
          <div><span>Average change vs FY{matrix.previousFiscalYear}</span><strong>{matrix.summary.averageChangePct === null ? '—' : `${matrix.summary.averageChangePct > 0 ? '+' : ''}${matrix.summary.averageChangePct.toFixed(1)}%`}</strong></div>
          <div><span>Minimum levy applied</span><strong>{matrix.summary.minimumLevyCount}</strong></div>
        </div>

        {locked && (
          <div className="rate-locked-notice">
            <Lock size={15} aria-hidden="true" />
            <span>
              {matrix.summary.status === 'PUBLISHED'
                ? 'These rates are published and immutable. Create a new fiscal-year schedule to revise them.'
                : matrix.summary.status === 'PENDING_APPROVAL'
                  ? 'This matrix is awaiting Assembly approval. Editing is locked until it is approved or rejected.'
                  : 'Your role cannot edit this rate matrix.'}
            </span>
            {matrix.summary.status === 'PENDING_APPROVAL' && <Link href="/concessions/approvals" className="dashboard-text-link">Open approvals <ArrowRight size={13} aria-hidden="true" /></Link>}
          </div>
        )}

        <div className="table-wrap rate-table-wrap">
          <table className="rate-table">
            <thead><tr><th>Type</th><th>Usage</th><th>Base rate (GHS)</th><th>Rate impost (%)</th><th>Minimum levy (GHS)</th><th>Δ vs FY{matrix.previousFiscalYear}</th><th>Status</th></tr></thead>
            <tbody>
              {visible.map((row) => {
                const index = rows.indexOf(row);
                return (
                  <tr key={`${row.propertyTypeId}:${row.propertyUsageId}`} className={row.draftBaseRate === '' ? 'unconfigured-row' : ''}>
                    <td><span className="rate-type">{row.propertyTypeCode}</span><small>{row.propertyTypeName}</small></td>
                    <td><span className="rate-usage">{row.propertyUsageCode}</span><small>{row.propertyUsageName}</small></td>
                    <td><input className="rate-input" inputMode="decimal" value={row.draftBaseRate} onChange={(event) => updateRow(index, 'draftBaseRate', event.target.value)} disabled={locked} aria-label={`${row.propertyTypeCode} ${row.propertyUsageCode} base rate`} placeholder="—" /></td>
                    <td><div className="rate-percent-input"><input className="rate-input" inputMode="decimal" value={row.draftRateImpost} onChange={(event) => updateRow(index, 'draftRateImpost', event.target.value)} disabled={locked} aria-label={`${row.propertyTypeCode} ${row.propertyUsageCode} rate impost`} placeholder="0.0000" /><span>%</span></div></td>
                    <td><input className="rate-input" inputMode="decimal" value={row.draftMinimumLevy} onChange={(event) => updateRow(index, 'draftMinimumLevy', event.target.value)} disabled={locked} aria-label={`${row.propertyTypeCode} ${row.propertyUsageCode} minimum levy`} placeholder="0" /></td>
                    <td>{changeLabel(row.changePct)}</td>
                    <td><span className={`rate-row-status ${row.status.toLowerCase()}`}>{row.status.replaceAll('_', ' ')}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && <div className="concession-inline-empty">No rate combinations match this filter.</div>}
        {result && <div className={`notice ${result.ok ? 'ok' : 'error'}`}>{result.ok && <Check size={13} aria-hidden="true" />}{result.message}</div>}
      </div>

      {impactOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setImpactOpen(false)}>
          <div className="impact-modal" role="dialog" aria-modal="true" aria-labelledby="impact-title" onClick={(event) => event.stopPropagation()}>
            <div className="impact-modal-heading">
              <div><span className="dashboard-section-label">IMPACT ANALYSIS</span><h2 id="impact-title">FY{matrix.fiscalYear} rate movement</h2><p>{matrix.assembly.assemblyName} · compared with FY{matrix.previousFiscalYear}</p></div>
              <button type="button" className="icon-button" onClick={() => setImpactOpen(false)} aria-label="Close impact analysis"><X size={17} aria-hidden="true" /></button>
            </div>
            <div className="impact-summary">
              <div><span>Configured combinations</span><strong>{matrix.summary.configured}/{matrix.summary.total}</strong></div>
              <div><span>Average rate change</span><strong>{matrix.summary.averageChangePct === null ? '—' : `${matrix.summary.averageChangePct > 0 ? '+' : ''}${matrix.summary.averageChangePct.toFixed(1)}%`}</strong></div>
              <div><span>Rows on minimum levy</span><strong>{matrix.summary.minimumLevyCount}</strong></div>
            </div>
            <div className="impact-movers">
              <h3>Largest movements</h3>
              {matrix.summary.movers.length === 0 ? <p className="muted">A previous-year schedule is not available for comparison.</p> : matrix.summary.movers.map((mover) => (
                <div key={mover.label} className="impact-mover-row">
                  <span><strong>{mover.label.replace(' · ', ' — ')}</strong><small>{money(mover.previousBaseRate)} <ArrowRight size={10} aria-hidden="true" /> {money(mover.baseRate)}</small></span>
                  {changeLabel(mover.changePct)}
                </div>
              ))}
            </div>
            <div className="impact-note"><CircleDollarSign size={15} aria-hidden="true" /><span>Monetary billing projections require property valuation coverage and are intentionally not estimated here. The published rate schedule is the authoritative input to billing.</span></div>
            <div className="impact-actions"><button type="button" className="button button-secondary" onClick={() => setImpactOpen(false)}>Close</button><button type="button" className="button" onClick={() => { setImpactOpen(false); save(); }} disabled={locked || pending !== null}>Save draft</button></div>
          </div>
        </div>
      )}
    </>
  );
}
