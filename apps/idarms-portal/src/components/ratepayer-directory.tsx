'use client';

import Link from 'next/link';
import { ArrowRight, Mail, Phone, Plus, Search, UserRound, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface RatepayerRecord {
  id: string;
  reference: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  status: string;
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes('ACTIVE') || normalized.includes('VERIFIED') || normalized.includes('APPROVED')) return 'positive';
  if (normalized.includes('PENDING') || normalized.includes('REVIEW')) return 'pending';
  if (normalized.includes('REJECT') || normalized.includes('SUSPEND') || normalized.includes('INACTIVE')) return 'negative';
  return 'neutral';
}

export function RatepayerDirectory({ ratepayers }: { ratepayers: RatepayerRecord[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const statuses = useMemo(() => Array.from(new Set(ratepayers.map((record) => record.status))).sort(), [ratepayers]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return ratepayers.filter((record) => {
      const matchesQuery = !normalizedQuery || [record.fullName, record.reference, record.phone ?? '', record.email ?? '']
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesQuery && (status === 'all' || record.status === status);
    });
  }, [query, ratepayers, status]);
  const phoneContacts = ratepayers.filter((record) => record.phone).length;
  const emailContacts = ratepayers.filter((record) => record.email).length;
  const completeContacts = ratepayers.filter((record) => record.phone && record.email).length;

  return (
    <section className="entity-page">
      <div className="entity-hero">
        <div className="entity-hero-copy">
          <span className="entity-kicker"><span className="module-kicker-icon"><UsersRound size={14} aria-hidden="true" /></span> PEOPLE &amp; ACCOUNTS</span>
          <h1>Ratepayer directory</h1>
          <p>One clear workspace for ratepayer identity, contact details, and registration status.</p>
        </div>
        <div className="entity-hero-actions">
          <span className="hero-total"><strong>{ratepayers.length.toLocaleString()}</strong><small>Records synced</small></span>
          <Link href="/ratepayers/new" className="button"><Plus size={16} aria-hidden="true" /> Register ratepayer</Link>
        </div>
      </div>

      <div className="directory-metrics">
        <article className="directory-metric"><span className="directory-metric-icon blue"><UsersRound size={17} aria-hidden="true" /></span><div><small>In this directory</small><strong>{ratepayers.length.toLocaleString()}</strong></div></article>
        <article className="directory-metric"><span className="directory-metric-icon teal"><Phone size={16} aria-hidden="true" /></span><div><small>Phone numbers</small><strong>{phoneContacts.toLocaleString()}</strong></div><span className="metric-footnote">Records with a phone number</span></article>
        <article className="directory-metric"><span className="directory-metric-icon violet"><Mail size={16} aria-hidden="true" /></span><div><small>Email addresses</small><strong>{emailContacts.toLocaleString()}</strong></div><span className="metric-footnote">Records with an email address</span></article>
        <article className="directory-metric"><span className="directory-metric-icon amber"><Mail size={16} aria-hidden="true" /></span><div><small>Contact complete</small><strong>{ratepayers.length ? `${Math.round((completeContacts / ratepayers.length) * 100)}%` : '—'}</strong></div><span className="metric-footnote">{completeContacts} with phone and email</span></article>
      </div>

      <div className="directory-card">
        <div className="directory-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><UsersRound size={17} aria-hidden="true" /></span>
            <div><h2>All ratepayers</h2><p>{filtered.length.toLocaleString()} {filtered.length === 1 ? 'record' : 'records'} shown</p></div>
          </div>
          <Link href="/ratepayers/new" className="button button-compact"><Plus size={14} aria-hidden="true" /> Add ratepayer</Link>
        </div>
        <div className="directory-tools">
          <label className="search-field"><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, reference or contact" aria-label="Search ratepayers" /></label>
          <label className="filter-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
        </div>
        {filtered.length === 0 ? (
          <div className="directory-empty">
            <span className="empty-mark"><UserRound size={20} aria-hidden="true" /></span>
            <h3>{ratepayers.length ? 'No matching ratepayers' : 'Your directory is ready'}</h3>
            <p>{ratepayers.length ? 'Try another name, reference, contact, or status.' : 'New ratepayers registered in CROIP will appear here after synchronization.'}</p>
            {ratepayers.length === 0 && <Link href="/ratepayers/new" className="button">Register a ratepayer <ArrowRight size={14} aria-hidden="true" /></Link>}
          </div>
        ) : (
          <div className="table-wrap directory-table-wrap">
            <table className="directory-table">
              <thead><tr><th>Ratepayer</th><th>Contact</th><th>Reference</th><th>Registration status</th></tr></thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.id}>
                    <td><div className="record-primary"><span className="record-avatar">{record.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'R'}</span><span><strong>{record.fullName}</strong><small>Ratepayer account</small></span></div></td>
                    <td><div className="record-contact">{record.phone ? <span><Phone size={12} aria-hidden="true" />{record.phone}</span> : <span className="record-missing">No phone provided</span>}{record.email && <span><Mail size={12} aria-hidden="true" />{record.email}</span>}</div></td>
                    <td><span className="reference-value">{record.reference}</span></td>
                    <td><span className={`status-badge ${statusTone(record.status)}`}><i />{record.status.replaceAll('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="directory-footnote">Records shown are returned by iDARMS services. New CROIP registrations appear after the sync bridge updates this directory.</p>
    </section>
  );
}
