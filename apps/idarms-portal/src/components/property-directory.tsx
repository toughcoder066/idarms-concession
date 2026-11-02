'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, Clock3, MapPin, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface PropertyRecord {
  id: string;
  externalPropertyId?: string;
  reference?: string;
  ratepayerRef?: string | null;
  ratepayerId?: string | null;
  propertyType: string;
  status: string;
}

function propertyReference(record: PropertyRecord): string {
  return record.externalPropertyId ?? record.reference ?? record.id;
}

function propertyRatepayer(record: PropertyRecord): string {
  return record.ratepayerRef ?? record.ratepayerId ?? '—';
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes('VERIFIED') || normalized.includes('APPROVED')) return 'positive';
  if (normalized.includes('PENDING') || normalized.includes('PROGRESS') || normalized.includes('INSPECTION')) return 'pending';
  if (normalized.includes('REJECT')) return 'negative';
  return 'neutral';
}

export function PropertyDirectory({ properties }: { properties: PropertyRecord[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const statuses = useMemo(() => Array.from(new Set(properties.map((record) => record.status))).sort(), [properties]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return properties.filter((record) => {
      const matchesQuery = !normalizedQuery || [propertyReference(record), propertyRatepayer(record), record.propertyType]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesQuery && (status === 'all' || record.status === status);
    });
  }, [properties, query, status]);
  const verifiedCount = properties.filter((record) => record.status.toUpperCase() === 'VERIFIED').length;
  const pendingCount = properties.filter((record) => record.status.toUpperCase().includes('PENDING')).length;

  return (
    <section className="entity-page">
      <div className="entity-breadcrumb"><span>Operations</span><span>/</span><span>Properties</span></div>
      <div className="entity-hero">
        <div className="entity-hero-copy">
          <span className="entity-kicker"><span className="module-kicker-icon"><Building2 size={14} aria-hidden="true" /></span> PROPERTY OPERATIONS</span>
          <h1>Property register</h1>
          <p>Manage registered properties, their ratepayer accounts, and verification progress.</p>
        </div>
        <div className="entity-hero-actions">
          <span className="hero-total"><strong>{properties.length.toLocaleString()}</strong><small>Properties synced</small></span>
          <Link href="/properties/new" className="button"><Plus size={16} aria-hidden="true" /> Register property</Link>
        </div>
      </div>

      <div className="directory-metrics">
        <article className="directory-metric"><span className="directory-metric-icon blue"><Building2 size={17} aria-hidden="true" /></span><div><small>Total properties</small><strong>{properties.length.toLocaleString()}</strong></div><span className="metric-footnote">All records in this workspace</span></article>
        <article className="directory-metric"><span className="directory-metric-icon teal"><CheckCircle2 size={17} aria-hidden="true" /></span><div><small>Verified</small><strong>{verifiedCount.toLocaleString()}</strong></div><span className="metric-footnote">Approved for the register</span></article>
        <article className="directory-metric"><span className="directory-metric-icon amber"><Clock3 size={17} aria-hidden="true" /></span><div><small>Pending verification</small><strong>{pendingCount.toLocaleString()}</strong></div><span className="metric-footnote">Awaiting field review</span></article>
        <article className="directory-metric"><span className="directory-metric-icon violet"><MapPin size={17} aria-hidden="true" /></span><div><small>Property types</small><strong>{new Set(properties.map((property) => property.propertyType)).size.toLocaleString()}</strong></div><span className="metric-footnote">Unique types in the register</span></article>
      </div>

      <div className="directory-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><Building2 size={17} aria-hidden="true" /></span>
            <div><h2>All properties</h2><p>{filtered.length.toLocaleString()} {filtered.length === 1 ? 'record' : 'records'} shown</p></div>
          </div>
          <Link href="/properties/new" className="button button-compact"><Plus size={14} aria-hidden="true" /> Add property</Link>
        </div>
        <div className="directory-tools">
          <label className="search-field"><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, ratepayer or type" aria-label="Search properties" /></label>
          <label className="filter-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
        </div>
        {filtered.length === 0 ? (
          <div className="directory-empty">
            <span className="empty-mark"><Building2 size={20} aria-hidden="true" /></span>
            <h3>{properties.length ? 'No matching properties' : 'Your property register is ready'}</h3>
            <p>{properties.length ? 'Try another reference, ratepayer ID, type, or status.' : 'New properties registered in CROIP will appear here after synchronization.'}</p>
            {properties.length === 0 && <Link href="/properties/new" className="button">Register a property <ArrowRight size={14} aria-hidden="true" /></Link>}
          </div>
        ) : (
          <div className="table-wrap directory-table-wrap">
            <table className="directory-table">
              <thead><tr><th>Property</th><th>Ratepayer ID</th><th>Property type</th><th>Verification status</th></tr></thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.id}>
                    <td><div className="record-primary"><span className="record-avatar property-avatar"><Building2 size={16} aria-hidden="true" /></span><span><strong>{propertyReference(record)}</strong><small>Property reference</small></span></div></td>
                    <td><span className="reference-value">{propertyRatepayer(record)}</span></td>
                    <td><span className="type-label">{record.propertyType.replaceAll('_', ' ')}</span></td>
                    <td><span className={`status-badge ${statusTone(record.status)}`}><i />{record.status.replaceAll('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="directory-footnote">Property and ratepayer links reflect the identifiers returned by iDARMS services. New CROIP registrations appear after synchronization.</p>
    </section>
  );
}
