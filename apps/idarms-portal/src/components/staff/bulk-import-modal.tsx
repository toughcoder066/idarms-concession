'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  FileSpreadsheet,
  RotateCcw,
  Upload,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  commitBulkImportAction,
  validateBulkImportAction,
} from '@/app/assembly/[assemblyId]/staff-access/actions';
import {
  staffErrorMessage,
  type BulkImportCommitResult,
  type BulkImportValidation,
  type CommitStatus,
  type PreviewStatus,
} from '@/lib/staff';

type Step = 'input' | 'preview' | 'result';

interface AssemblyOption {
  assemblyId: string;
  assemblyName: string | null;
  assemblyCode: string | null;
}

function previewTone(status: PreviewStatus): string {
  if (status === 'Valid') return 'positive';
  if (status === 'Warning') return 'pending';
  if (status === 'Duplicate') return 'neutral';
  return 'negative';
}

function commitTone(status: CommitStatus): string {
  if (status === 'Invited') return 'positive';
  if (status === 'Already exists') return 'neutral';
  if (status === 'Needs review') return 'pending';
  return 'negative';
}

function previewIcon(status: PreviewStatus) {
  if (status === 'Valid') return <CheckCircle2 size={13} aria-hidden="true" />;
  if (status === 'Warning') return <Clock3 size={13} aria-hidden="true" />;
  if (status === 'Duplicate') return <Copy size={13} aria-hidden="true" />;
  return <XCircle size={13} aria-hidden="true" />;
}

export function BulkImportModal({
  open,
  onClose,
  fixedAssemblyId,
  fixedAssemblyName,
  assemblyOptions = [],
  onCommitted,
}: {
  open: boolean;
  onClose: () => void;
  fixedAssemblyId?: string;
  fixedAssemblyName?: string;
  assemblyOptions?: AssemblyOption[];
  onCommitted?: () => void;
}) {
  const requiresAssembly = !fixedAssemblyId;
  const [selectedAssemblyId, setSelectedAssemblyId] = useState(fixedAssemblyId ?? '');
  const [step, setStep] = useState<Step>('input');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [validation, setValidation] = useState<BulkImportValidation | null>(null);
  const [commit, setCommit] = useState<BulkImportCommitResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('input');
    setValidation(null);
    setCommit(null);
    setError(null);
    setPending(false);
    setSelectedAssemblyId(fixedAssemblyId ?? '');
    // Reset only when the dialog opens; parent refreshes should not wipe an in-progress batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedAssemblyId]);

  const selectedOption = assemblyOptions.find((option) => option.assemblyId === selectedAssemblyId);
  const assemblyName = fixedAssemblyName ?? selectedOption?.assemblyName ?? 'Selected assembly';
  const previewCounts = useMemo(() => {
    if (!validation) return null;
    const importable = validation.summary.valid + validation.summary.warning;
    return { ...validation.summary, importable };
  }, [validation]);
  const failedRows = commit?.rows.filter((row) => row.status === 'Failed – retry available') ?? [];

  if (!open) return null;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setError(null);
  }

  async function validate() {
    if (requiresAssembly && !selectedAssemblyId) {
      setError('Select the assembly this batch targets.');
      return;
    }
    if (!csv.trim()) {
      setError('Choose a CSV file or paste CSV rows first.');
      return;
    }
    setPending(true);
    setError(null);
    const result = await validateBulkImportAction(selectedAssemblyId, csv);
    setPending(false);
    if (!result.ok) {
      setError(staffErrorMessage(result.code, result.message));
      return;
    }
    setValidation(result.data ?? null);
    setStep('preview');
  }

  async function commitBatch() {
    if (!validation) return;
    setPending(true);
    setError(null);
    const result = await commitBulkImportAction(selectedAssemblyId, validation.batchId);
    setPending(false);
    if (!result.ok) {
      setError(staffErrorMessage(result.code, result.message));
      return;
    }
    setCommit(result.data ?? null);
    setStep('result');
    onCommitted?.();
  }

  async function retryFailed() {
    if (!commit) return;
    setPending(true);
    setError(null);
    const result = await commitBulkImportAction(selectedAssemblyId, commit.batchId);
    setPending(false);
    if (!result.ok) {
      setError(staffErrorMessage(result.code, result.message));
      return;
    }
    setCommit(result.data ?? null);
    onCommitted?.();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal-card bulk-import-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
        <div className="modal-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><FileSpreadsheet size={17} aria-hidden="true" /></span>
            <div>
              <h2 id="bulk-import-title">Bulk import staff</h2>
              <p>{assemblyName} · validate first, then commit</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close bulk import dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="import-steps" aria-label="Bulk import progress">
          <span className={step === 'input' ? 'active' : 'complete'}>1 · Upload</span>
          <span className={step === 'preview' ? 'active' : step === 'result' ? 'complete' : ''}>2 · Review</span>
          <span className={step === 'result' ? 'active' : ''}>3 · Result</span>
        </div>

        <div className="modal-body">
          {step === 'input' && (
            <div className="import-input-step">
              {requiresAssembly && (
                <label className="field">
                  Target assembly <span className="field-required">Required</span>
                  <select value={selectedAssemblyId} onChange={(event) => setSelectedAssemblyId(event.target.value)}>
                    <option value="" disabled>Select an assembly</option>
                    {assemblyOptions.map((option) => (
                      <option key={option.assemblyId} value={option.assemblyId}>
                        {option.assemblyName ?? option.assemblyId}{option.assemblyCode ? ` (${option.assemblyCode})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="import-dropzone">
                <Upload size={22} aria-hidden="true" />
                <strong>{fileName ?? 'Choose a CSV file'}</strong>
                <span>CSV columns: name, email, phone, role, assembly_code, org_id</span>
                <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
              </label>

              <label className="field">
                Or paste CSV rows
                <textarea
                  value={csv}
                  onChange={(event) => setCsv(event.target.value)}
                  rows={9}
                  placeholder={'name,email,phone,role\nAma Mensah,ama@assembly.gov.gh,+233200000000,FIELD_AGENT'}
                  spellCheck={false}
                />
              </label>
              <p className="import-help">
                Validation never writes to ZITADEL. Rows outside your role ceiling, duplicate emails,
                assembly mismatches, and malformed emails are flagged before anything is invited.
              </p>
            </div>
          )}

          {step === 'preview' && validation && previewCounts && (
            <div className="import-preview-step">
              <div className="import-summary">
                <span className="import-summary-chip total"><Users size={13} aria-hidden="true" /> {previewCounts.total} rows</span>
                <span className="import-summary-chip positive"><CheckCircle2 size={13} aria-hidden="true" /> {previewCounts.importable} importable</span>
                <span className="import-summary-chip neutral"><Copy size={13} aria-hidden="true" /> {previewCounts.duplicate} duplicate</span>
                <span className="import-summary-chip negative"><XCircle size={13} aria-hidden="true" /> {previewCounts.invalidRole + previewCounts.assemblyMismatch + previewCounts.error} blocked</span>
                <span className="import-batch-ref">Batch {validation.batchId.slice(0, 8)}</span>
              </div>
              <div className="table-wrap import-table-wrap">
                <table className="directory-table staff-table import-table">
                  <thead>
                    <tr><th>Row</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {validation.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.name || '—'}</td>
                        <td>{row.email || '—'}</td>
                        <td>{row.role || '—'}</td>
                        <td>
                          <span className={`status-badge ${previewTone(row.status)}`}>
                            {previewIcon(row.status)}{row.status}
                          </span>
                        </td>
                        <td><span className="import-note">{row.message ?? 'Ready to import.'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'result' && commit && (
            <div className="import-result-step">
              <div className="import-summary">
                <span className="import-summary-chip positive"><CheckCircle2 size={13} aria-hidden="true" /> {commit.summary.invited} invited</span>
                <span className="import-summary-chip neutral"><Copy size={13} aria-hidden="true" /> {commit.summary.alreadyExists} already existed</span>
                <span className="import-summary-chip negative"><AlertTriangle size={13} aria-hidden="true" /> {commit.summary.failed} failed</span>
                <span className="import-summary-chip pending"><Clock3 size={13} aria-hidden="true" /> {commit.summary.needsReview} need review</span>
              </div>
              <div className="table-wrap import-table-wrap">
                <table className="directory-table staff-table import-table">
                  <thead>
                    <tr><th>Row</th><th>Name</th><th>Email</th><th>Role</th><th>Result</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {commit.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.name || '—'}</td>
                        <td>{row.email || '—'}</td>
                        <td>{row.role || '—'}</td>
                        <td><span className={`status-badge ${commitTone(row.status)}`}>{row.status}</span></td>
                        <td><span className="import-note">{row.message ?? (row.status === 'Invited' ? 'Invitation created.' : '—')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="import-explain">
                <strong>What &ldquo;Needs review&rdquo; means:</strong> this row was not imported because it is invalid,
                conflicts with an existing role, or needs a corrected source row. Fix the CSV and start a new batch.
              </div>
            </div>
          )}

          {error && <div className="form-result error" role="alert">{error}</div>}
        </div>

        <div className="modal-footer">
          {step !== 'input' && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => { setStep('input'); setError(null); }}
              disabled={pending}
            >
              Back
            </button>
          )}
          {step === 'input' && (
            <>
              <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="button" onClick={validate} disabled={pending || (requiresAssembly && !selectedAssemblyId)}>
                {pending ? 'Validating…' : 'Validate rows'}
              </button>
            </>
          )}
          {step === 'preview' && (
            <button type="button" className="button" onClick={commitBatch} disabled={pending || !previewCounts?.total}>
              {pending ? 'Committing…' : `Commit ${previewCounts?.total ?? 0} rows`}
            </button>
          )}
          {step === 'result' && (
            <>
              {failedRows.length > 0 && (
                <button type="button" className="button button-secondary" onClick={retryFailed} disabled={pending}>
                  <RotateCcw size={14} aria-hidden="true" /> {pending ? 'Retrying…' : `Retry ${failedRows.length} failed`}
                </button>
              )}
              <button type="button" className="button" onClick={onClose}>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
