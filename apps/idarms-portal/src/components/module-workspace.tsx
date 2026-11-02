import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Database } from 'lucide-react';
import Link from 'next/link';

export interface WorkspaceColumn {
  key: string;
  label: string;
}

export function ModuleWorkspace({
  title,
  eyebrow,
  description,
  columns,
  records,
  emptyMessage,
  serviceAvailable,
  icon: Icon,
}: {
  title: string;
  eyebrow: string;
  description: string;
  columns: WorkspaceColumn[];
  records: Array<Record<string, string | number>>;
  emptyMessage: string;
  serviceAvailable: boolean;
  icon: LucideIcon;
}) {
  return (
    <section className="entity-page">
      <div className="entity-breadcrumb"><Link href="/dashboard">Dashboard</Link><span>/</span><span>{title}</span></div>
      <div className="entity-hero module-hero">
        <div className="entity-hero-copy">
          <span className="entity-kicker"><span className="module-kicker-icon"><Icon size={14} aria-hidden="true" /></span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="module-total"><strong>{records.length.toLocaleString('en-GH')}</strong><small>Records available</small></div>
      </div>
      <section className="directory-card module-directory-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><Icon size={17} aria-hidden="true" /></span>
            <div><h2>{title} workspace</h2><p>{records.length.toLocaleString('en-GH')} records from the connected service</p></div>
          </div>
          <Link href="/dashboard" className="dashboard-text-link"><ArrowLeft size={14} aria-hidden="true" /> Back to overview</Link>
        </div>
        {records.length === 0 ? (
          <div className="directory-empty">
            <span className="empty-mark"><Database size={20} aria-hidden="true" /></span>
            <h3>{serviceAvailable ? `No ${title.toLowerCase()} yet` : `${title} service unavailable`}</h3>
            <p>{serviceAvailable ? emptyMessage : 'The service did not return data. Check the service connection or try again later.'}</p>
          </div>
        ) : (
          <div className="table-wrap directory-table-wrap">
            <table className="directory-table">
              <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
              <tbody>
                {records.map((record, index) => (
                  <tr key={String(record.id ?? index)}>
                    {columns.map((column) => <td key={column.key}><span className="reference-value">{record[column.key] ?? '—'}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="directory-footnote">Records are read from the connected iDARMS service and scoped to the signed-in workspace.</p>
    </section>
  );
}
