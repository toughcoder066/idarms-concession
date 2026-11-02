'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardList,
  X,
} from 'lucide-react';
import {
  auditActorKind,
  getRoleDefinition,
} from '@idarms/contracts';
import { loadAuditBatchAction } from '@/app/audit-actions';
import {
  auditDescriptionMetadata,
  auditErrorMessage,
  auditOutcomeTone,
  auditTargetLabel,
  formatAuditTimestamp,
  type AuditEntry,
} from '@/lib/audit';
import type {
  BulkImportBatchDetail,
  BulkImportCommitRow,
  BulkImportPreviewRow,
} from '@/lib/staff';

type BatchRow = BulkImportPreviewRow | BulkImportCommitRow;

function actorBadge(role: string | null): { kind: string; label: string } {
  const kind = auditActorKind(role);
  const label = role === 'PLATFORM_ADMIN'
    ? 'Platform Admin'
    : role && role !== 'UNKNOWN'
      ? (getRoleDefinition(role)?.displayName ?? role)
      : 'Unknown actor';
  return { kind, label };
}

function rowTone(status: string): string {
  if (status === 'Valid' || status === 'Invited') return 'positive';
  if (status === 'Warning' || status === 'Needs review') return 'pending';
  if (status === 'Already exists' || status === 'Duplicate') return 'neutral';
  return 'negative';
}

function batchRows(detail: BulkImportBatchDetail | null): BatchRow[] {
  if (!detail) return [];
  return detail.results ?? detail.rows ?? [];
}

export function AuditEventTable({
  entries,
  showAssemblyColumn = false,
  emptyMessage = 'No audit entries match these filters.',
}: {
  entries: AuditEntry[];
  showAssemblyColumn?: boolean;
  emptyMessage?: string;
}) {
  const [selectedBatch, setSelectedBatch] = useState<{
    assemblyId: string;
    batchId: string;
    label: string;
    actorId: string;
    actorName: string | null;
  } | null>(null);
  const [detail, setDetail] = useState<BulkImportBatchDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openBatch(entry: AuditEntry) {
    if (!entry.assemblyId || !entry.batchId) return;
    setSelectedBatch({
      assemblyId: entry.assemblyId,
      batchId: entry.batchId,
      label: entry.description,
      actorId: entry.actorId,
      actorName: entry.actorName,
    });
    setDetail(null);
    setError(null);
    setPending(true);
    const result = await loadAuditBatchAction(entry.assemblyId, entry.batchId);
    setPending(false);
    if (!result.ok) {
      setError(auditErrorMessage(result.code, result.message));
      return;
    }
    setDetail(result.data ?? null);
  }

  function closeBatch() {
    setSelectedBatch(null);
    setDetail(null);
    setError(null);
    setPending(false);
  }

  const rows = batchRows(detail);
  const hasNeedsReview = rows.some((row) => row.status === 'Needs review');

  return (
    <>
      {entries.length === 0 ? (
        <div className="staff-empty audit-empty">
          <span className="empty-mark"><ClipboardList size={22} aria-hidden="true" /></span>
          <h3>No activity found</h3>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="directory-table staff-table audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                {showAssemblyColumn && <th>Assembly</th>}
                <th>Target</th>
                <th>Outcome</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const badge = actorBadge(entry.actorRole);
                const summary = auditDescriptionMetadata(entry);
                return (
                  <tr key={entry.id}>
                    <td><span className="audit-when">{formatAuditTimestamp(entry.occurredAt)}</span></td>
                    <td>
                      <div className="audit-actor">
                        <strong>{entry.actorName ?? entry.actorId}</strong>
                        <span className={`audit-actor-badge ${badge.kind}`}>{badge.label}</span>
                        {entry.actorEmail && <small>{entry.actorEmail}</small>}
                      </div>
                    </td>
                    <td>
                      <span className="audit-action">{entry.actionLabel}</span>
                      <small className="audit-action-code">{entry.action}</small>
                    </td>
                    {showAssemblyColumn && (
                      <td>
                        <span className="audit-assembly">{entry.assemblyName ?? entry.assemblyId ?? '—'}</span>
                        {entry.assemblyCode && <small className="audit-action-code">{entry.assemblyCode}</small>}
                      </td>
                    )}
                    <td><span className="audit-target">{auditTargetLabel(entry)}</span></td>
                    <td>
                      <span className={`status-badge ${auditOutcomeTone(entry.outcome)}`}>
                        <i />{entry.outcome}
                      </span>
                    </td>
                    <td>
                      <div className="audit-description">
                        <span>{entry.description}</span>
                        {summary && <small>{summary}</small>}
                        {entry.batchId && (
                          <button
                            type="button"
                            className="audit-batch-link"
                            onClick={() => openBatch(entry)}
                          >
                            View batch <ArrowUpRight size={12} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedBatch && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeBatch();
        }}>
          <div className="modal-card audit-batch-modal" role="dialog" aria-modal="true" aria-labelledby="audit-batch-title">
            <div className="modal-heading">
              <div className="directory-title">
                <span className="directory-title-icon"><ClipboardList size={17} aria-hidden="true" /></span>
                <div>
                  <h2 id="audit-batch-title">Bulk import batch</h2>
                  <p>{selectedBatch.label}</p>
                </div>
              </div>
              <button type="button" className="icon-button" onClick={closeBatch} aria-label="Close batch detail">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="modal-body">
              {pending && <p className="audit-batch-note">Loading batch detail…</p>}
              {error && <div className="form-result error" role="alert">{error}</div>}
              {detail && (
                <>
                  <div className="audit-batch-meta">
                    <span className={`status-badge ${detail.status === 'COMMITTED' ? 'positive' : 'pending'}`}><i />{detail.status}</span>
                    <span>Created {formatAuditTimestamp(detail.createdAt)}</span>
                    {detail.committedAt && <span>Committed {formatAuditTimestamp(detail.committedAt)}</span>}
                    <span>By {selectedBatch.actorName ?? selectedBatch.actorId} · {detail.createdByRole}</span>
                  </div>
                  {!detail.results && (
                    <p className="audit-batch-note">This batch was validated but not committed, so no users were provisioned.</p>
                  )}
                  {hasNeedsReview && (
                    <div className="audit-batch-note">
                      <AlertTriangle size={14} aria-hidden="true" />
                      “Needs review” rows were not provisioned because they conflicted with current state or failed re-validation. Correct the row or retry after resolving the conflict.
                    </div>
                  )}
                  {rows.length === 0 ? (
                    <p className="audit-batch-note">No per-row data is stored for this batch.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="directory-table staff-table audit-batch-table">
                        <thead>
                          <tr>
                            <th>Row</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={`${row.rowNumber}-${row.email}`}>
                              <td>{row.rowNumber}</td>
                              <td>{row.name || '—'}</td>
                              <td>{row.email || '—'}</td>
                              <td>{getRoleDefinition(row.role)?.displayName ?? (row.role || '—')}</td>
                              <td>
                                <span className={`status-badge ${rowTone(row.status)}`}><i />{row.status}</span>
                                {'message' in row && row.message && <small className="audit-row-message">{row.message}</small>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
