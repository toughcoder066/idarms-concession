'use client';

import { useState } from 'react';
import { Mail, Phone, ShieldCheck, UserPlus, X } from 'lucide-react';
import { inviteStaffAction } from '@/app/assembly/[assemblyId]/staff-access/actions';
import { staffErrorMessage, type StaffRoleOption } from '@/lib/staff';

export function InviteStaffModal({
  open,
  assemblyId,
  assemblyName,
  roleOptions,
  onClose,
  onInvited,
}: {
  open: boolean;
  assemblyId: string;
  assemblyName: string;
  roleOptions: StaffRoleOption[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    setSuccess(null);

    const result = await inviteStaffAction(assemblyId, {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim() || undefined,
      role: String(data.get('role') ?? '').trim(),
    });

    setPending(false);
    if (!result.ok) {
      setError(staffErrorMessage(result.code, result.message));
      return;
    }

    const dataResult = result.data;
    form.reset();
    setSuccess(
      dataResult?.inviteStatus === 'INVITED'
        ? `Invitation sent to ${dataResult.email} as ${dataResult.role.replaceAll('_', ' ')}.`
        : dataResult?.inviteStatus === 'ALREADY_EXISTS'
          ? 'This user already has that role in the assembly.'
          : 'The existing user was granted access to this assembly.',
    );
    onInvited();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal-card staff-modal" role="dialog" aria-modal="true" aria-labelledby="invite-staff-title">
        <div className="modal-heading">
          <div className="directory-title">
            <span className="directory-title-icon"><UserPlus size={17} aria-hidden="true" /></span>
            <div>
              <h2 id="invite-staff-title">Invite staff</h2>
              <p>{assemblyName} · ZITADEL invitation</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close invite dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="field-grid">
              <label className="field field-wide">
                Full name <span className="field-required">Required</span>
                <input name="name" required minLength={1} maxLength={150} placeholder="e.g. Ama Mensah" autoComplete="name" />
              </label>
              <label className="field">
                Email <span className="field-required">Required</span>
                <span className="input-with-icon"><Mail size={14} aria-hidden="true" /><input name="email" type="email" required maxLength={254} placeholder="name@assembly.gov.gh" autoComplete="email" /></span>
              </label>
              <label className="field">
                Phone <span className="field-optional">Optional</span>
                <span className="input-with-icon"><Phone size={14} aria-hidden="true" /><input name="phone" maxLength={30} placeholder="+233 20 000 0000" autoComplete="tel" /></span>
              </label>
              <label className="field field-wide">
                Role <span className="field-required">Required</span>
                <span className="input-with-icon"><ShieldCheck size={14} aria-hidden="true" /><select name="role" required defaultValue="">
                  <option value="" disabled>Select a permitted role</option>
                  {roleOptions.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                </select></span>
                <small>Only roles your current grant can provision are listed. The backend enforces the same ceiling.</small>
              </label>
            </div>
            {error && <div className="form-result error" role="alert">{error}</div>}
            {success && <div className="form-result ok" role="status">{success}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>Close</button>
            <button type="submit" className="button" disabled={pending || roleOptions.length === 0}>
              {pending ? 'Sending invite…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
