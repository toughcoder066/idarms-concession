'use client';

import { useMemo, useState } from 'react';
import { Download, Search, ShieldCheck } from 'lucide-react';
import type { AuditRecord } from '@/lib/concessions';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function AuditTable({ records }: { records: AuditRecord[] }) {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('all');
  const outcomes = useMemo(() => Array.from(new Set(records.map((record) => record.outcome))).sort(), [records]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const haystack = `${record.metadata.humanReadable ?? ''} ${record.action} ${record.actorId} ${record.resourceType}`.toLowerCase();
      return (!normalized || haystack.includes(normalized)) && (outcome === 'all' || record.outcome === outcome);
    });
  }, [outcome, query, records]);

  function exportCsv() {
    const header = ['Timestamp', 'Actor', 'Action', 'Outcome', 'Description', 'Resource type', 'Resource id'];
    const lines = filtered.map((record) => [
      record.occurredAt,
      record.actorId,
      record.action,
      record.outcome,
      record.metadata.humanReadable ?? '',
      record.resourceType,
      record.resourceId ?? '',
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `idarms-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="directory-card audit-card">
      <div className="directory-heading">
        <div className="directory-title"><span className="directory-title-icon"><ShieldCheck size={17} aria-hidden="true" /></span><div><h2>Immutable audit ledger</h2><p>{filtered.length} of {records.length} entries</p></div></div>
        <button type="button" className="button button-secondary button-compact" onClick={exportCsv}><Download size={14} aria-hidden="true" /> Export CSV</button>
      </div>
      <div className="directory-tools">
        <label className="search-field"><Search size={15} aria-hidden="true" /><input type="search" value={query} placeholder="Search action, actor or description" onChange={(event) => setQuery(event.target.value)} aria-label="Search audit ledger" /></label>
        <label className="filter-field"><span>Outcome</span><select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="all">All outcomes</option>{outcomes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      {filtered.length === 0 ? <div className="concession-inline-empty">No audit entries match this filter.</div> : (
        <div className="table-wrap">
          <table className="directory-table audit-table">
            <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Description</th><th>Outcome</th></tr></thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id}>
                  <td><span className="audit-timestamp">{formatDate(record.occurredAt)}</span></td>
                  <td><span className="reference-value">{record.actorId}</span></td>
                  <td><span className="audit-action">{record.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</span></td>
                  <td><span className="audit-description">{record.metadata.humanReadable ?? '—'}</span></td>
                  <td><span className={`status-badge ${record.outcome === 'SUCCESS' || record.outcome === 'APPROVED' ? 'positive' : record.outcome === 'REJECTED' ? 'negative' : 'neutral'}`}><i />{record.outcome.toLowerCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="audit-footnote">Audit entries are append-only. Human-readable descriptions are generated at the time of the change and cannot be edited.</div>
    </section>
  );
}
