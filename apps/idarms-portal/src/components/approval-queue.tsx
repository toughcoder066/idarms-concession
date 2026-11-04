'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import { approveAction, rejectAction } from '@/app/(portal)/concessions/actions';
import type { ApprovalRequest } from '@/lib/concessions';

interface ApprovalWithContext extends ApprovalRequest {
  matrix?: {
    configured: number;
    total: number;
    averageChangePct: number | null;
    movers: Array<{ label: string; changePct: number | null }>;
  } | null;
}

function relativeSla(value: string) {
  const millis = new Date(value).getTime() - Date.now();
  if (millis <= 0) return 'Overdue';
  const hours = Math.floor(millis / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(millis / 60_000))} min left`;
  if (hours < 48) return `${hours} hr${hours === 1 ? '' : 's'} left`;
  return `${Math.floor(hours / 24)} days left`;
}

export function ApprovalQueue({ approvals, canApprove }: { approvals: ApprovalWithContext[]; canApprove: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const router = useRouter();
  const pending = approvals.filter((approval) => approval.status === 'PENDING');
  const closed = approvals.filter((approval) => approval.status !== 'PENDING');

  async function decide(approval: ApprovalRequest, decision: 'approve' | 'reject') {
    setBusy(`${approval.id}:${decision}`);
    const note = notes[approval.id]?.trim() || undefined;
    const response = decision === 'approve' ? await approveAction(approval.id, note) : await rejectAction(approval.id, note);
    setResults((current) => ({ ...current, [approval.id]: response }));
    setBusy(null);
    if (response.ok) {
      setNotes((current) => ({ ...current, [approval.id]: '' }));
      router.refresh();
    }
  }

  return (
    <>
      <div className="approval-queue">
        <div className="approval-queue-heading">
          <div><span className="dashboard-section-label">DUAL CONTROL</span><h2>Pending decisions</h2><p>{pending.length} request{pending.length === 1 ? '' : 's'} awaiting an authorised decision.</p></div>
          <span className="status-badge pending"><i />{pending.length} pending</span>
        </div>
        {!canApprove && <div className="approval-role-note"><ShieldAlert size={15} aria-hidden="true" /><span>Your role can review this queue but cannot publish MMDA rates. An Assembly Administrator must approve rate matrices.</span></div>}
        {pending.length === 0 ? (
          <div className="concession-empty compact"><span className="empty-mark"><CheckCircle2 size={20} aria-hidden="true" /></span><h3>No pending approvals</h3><p>Submitted rate matrices will appear here for an authorised decision.</p></div>
        ) : pending.map((approval) => {
          const open = expanded === approval.id;
          const result = results[approval.id];
          const decisionBusy = busy?.startsWith(approval.id);
          return (
            <article key={approval.id} className={`approval-card${open ? ' open' : ''}`}>
              <div className="approval-card-main">
                <span className="approval-type-icon"><FileText size={17} aria-hidden="true" /></span>
                <div className="approval-card-copy">
                  <span className="approval-card-kicker">{approval.assembly?.assemblyName ?? 'Assembly'} · {approval.requestType === 'RATE_MATRIX' ? 'Rate matrix' : approval.requestType.replaceAll('_', ' ')}</span>
                  <h3>{approval.summary}</h3>
                  <p>Requested by {approval.requestedByName ?? 'workspace user'} · required role {approval.requiredRole.replaceAll('_', ' ')}</p>
                </div>
                <div className="approval-card-meta">
                  <span className={`approval-sla ${new Date(approval.slaDueAt).getTime() <= Date.now() ? 'overdue' : ''}`}><Clock3 size={13} aria-hidden="true" /> {relativeSla(approval.slaDueAt)}</span>
                  <button type="button" className="button button-secondary button-compact" onClick={() => setExpanded(open ? null : approval.id)}>{open ? 'Hide review' : 'Review'} <ChevronDown size={13} aria-hidden="true" /></button>
                </div>
              </div>
              {open && (
                <div className="approval-review">
                  <div className="approval-review-grid">
                    <div><small>Request type</small><strong>{approval.requestType.replaceAll('_', ' ')}</strong></div>
                    <div><small>Requested as</small><strong>{approval.payload.requestedAs === 'SUPPORT_FOR_MMDA' ? 'Concession Support draft' : 'Assembly submission'}</strong></div>
                    <div><small>Fiscal year</small><strong>{approval.payload.fiscalYear ?? '—'}</strong></div>
                    <div><small>Rows in scope</small><strong>{approval.payload.rowCount ?? '—'}</strong></div>
                  </div>
                  {approval.matrix && (
                    <div className="approval-matrix-summary">
                      <div><span>Configured</span><strong>{approval.matrix.configured}/{approval.matrix.total}</strong></div>
                      <div><span>Average rate change</span><strong>{approval.matrix.averageChangePct === null ? '—' : `${approval.matrix.averageChangePct > 0 ? '+' : ''}${approval.matrix.averageChangePct.toFixed(1)}%`}</strong></div>
                      {approval.matrix.movers.slice(0, 3).map((mover) => <span key={mover.label} className="approval-mover"><small>{mover.label}</small><strong>{mover.changePct === null ? '—' : `${mover.changePct > 0 ? '+' : ''}${mover.changePct.toFixed(1)}%`}</strong></span>)}
                      <Link href={`/concessions/rates?assembly=${approval.assemblyId}&fy=${approval.payload.fiscalYear ?? ''}`} className="dashboard-text-link">View full matrix <ArrowRight size={13} aria-hidden="true" /></Link>
                    </div>
                  )}
                  <label className="field">Decision note <span className="field-optional">Optional</span><textarea rows={2} value={notes[approval.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [approval.id]: event.target.value }))} placeholder="Add context for the audit ledger" /></label>
                  <div className="approval-review-actions">
                    {result && <span className={`form-result ${result.ok ? 'ok' : 'error'}`}>{result.ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}{result.message}</span>}
                    <button type="button" className="button button-secondary" onClick={() => decide(approval, 'reject')} disabled={!canApprove || decisionBusy}><XCircle size={14} aria-hidden="true" /> {busy === `${approval.id}:reject` ? 'Rejecting…' : 'Reject'}</button>
                    <button type="button" className="button" onClick={() => decide(approval, 'approve')} disabled={!canApprove || decisionBusy}><CheckCircle2 size={14} aria-hidden="true" /> {busy === `${approval.id}:approve` ? 'Approving…' : 'Approve & publish'}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="directory-card approval-history">
        <div className="directory-heading"><div className="directory-title"><span className="directory-title-icon"><Inbox size={17} aria-hidden="true" /></span><div><h2>Decision history</h2><p>{closed.length} resolved requests</p></div></div></div>
        {closed.length === 0 ? <div className="concession-inline-empty">No approvals have been resolved yet.</div> : (
          <div className="table-wrap"><table className="directory-table"><thead><tr><th>Assembly</th><th>Request</th><th>Requested by</th><th>Decision</th><th>Resolved</th></tr></thead><tbody>
            {closed.map((approval) => <tr key={approval.id}><td>{approval.assembly?.assemblyName ?? '—'}</td><td>{approval.requestType.replaceAll('_', ' ')} <small className="table-subtle">FY {approval.payload.fiscalYear ?? '—'}</small></td><td>{approval.requestedByName ?? 'Workspace user'}</td><td><span className={`status-badge ${approval.status === 'APPROVED' ? 'positive' : 'negative'}`}><i />{approval.status.toLowerCase()}</span></td><td>{approval.resolvedAt ? new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(approval.resolvedAt)) : '—'}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}
