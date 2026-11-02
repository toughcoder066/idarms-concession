'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Save } from 'lucide-react';
import { updateAssemblyAction } from '@/app/concessions/actions';
import type { AssemblyDetail } from '@/lib/concessions';

export function AssemblyProfileForm({ assembly }: { assembly: AssemblyDetail }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [logoUrl, setLogoUrl] = useState(assembly.logoUrl ?? '');
  const [signatureUrl, setSignatureUrl] = useState(assembly.signatureUrl ?? '');
  const [billNotice, setBillNotice] = useState(assembly.billNotice ?? '');
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    const response = await updateAssemblyAction(assembly.id, new FormData(event.currentTarget));
    setResult(response);
    setPending(false);
    if (response.ok) router.refresh();
  }

  return (
    <form className="assembly-profile-form" onSubmit={onSubmit}>
      <div className="assembly-profile-section" id="administration">
        <div className="assembly-profile-heading"><div><span className="dashboard-section-label">ADMINISTRATION</span><h2>Assembly profile</h2><p>Identifiers, region and the administrator responsible for publishing rates.</p></div></div>
        <div className="field-grid">
          <label className="field">Assembly name<input name="assemblyName" defaultValue={assembly.assemblyName} required /></label>
          <label className="field">Region<input name="region" defaultValue={assembly.region} required /></label>
          <label className="field">CROIP assembly ID<input name="croipAssemblyId" defaultValue={assembly.croipAssemblyId ?? ''} placeholder="croip_asm_..." /></label>
          <label className="field">Administrator email<input name="adminEmail" type="email" defaultValue={assembly.adminEmail ?? ''} placeholder="assembly.admin@example.gov.gh" /></label>
          <label className="field">Prefix rules<input name="prefixRules" defaultValue={assembly.prefixRules.join(', ')} placeholder="GA-, AMA-" /></label>
          <label className="field">Operating status
            <select name="status" defaultValue={assembly.status}>
              <option value="CONFIGURING">Configuring</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
        </div>
      </div>

      <div className="assembly-profile-section" id="branding">
        <div className="assembly-profile-heading"><div><span className="dashboard-section-label">BRANDING</span><h2>Bill branding</h2><p>Assets used on assembly bills. URLs are stored with the assembly profile.</p></div></div>
        <div className="branding-grid">
          <div className="field-grid">
            <label className="field">Logo URL<input name="logoUrl" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://…/logo.png" /></label>
            <label className="field">Signature URL<input name="signatureUrl" value={signatureUrl} onChange={(event) => setSignatureUrl(event.target.value)} placeholder="https://…/signature.png" /></label>
            <label className="field field-wide">Bill notice<textarea name="billNotice" rows={3} value={billNotice} onChange={(event) => setBillNotice(event.target.value)} placeholder="Notice printed on every assembly bill" /></label>
            <label className="field field-wide">Approved by<input name="brandingApprovedByName" defaultValue={assembly.brandingApprovedByName ?? ''} placeholder="Finance Director name" /><small>Recording an approver marks the branding assets as reviewed.</small></label>
          </div>
          <aside className="branding-preview">
            <span className="dashboard-section-label">BILL PREVIEW</span>
            <div className="bill-preview-card">
              <div className="bill-preview-top">
                {logoUrl ? <img src={logoUrl} alt="" className="bill-logo" /> : <span className="bill-logo-placeholder">{assembly.assemblyCode.slice(0, 2)}</span>}
                <div><strong>{assembly.assemblyName}</strong><small>{assembly.region}</small></div>
              </div>
              <div className="bill-preview-body"><span>Property rate assessment</span><strong>GHS 0.00</strong></div>
              <p>{billNotice || 'Bill notice will appear here.'}</p>
              <div className="bill-signature">{signatureUrl ? <img src={signatureUrl} alt="" /> : <span>Authorised signature</span>}</div>
            </div>
          </aside>
        </div>
      </div>

      <div className="assembly-profile-footer">
        {result && <span className={`form-result ${result.ok ? 'ok' : 'error'}`}>{result.ok && <Check size={13} aria-hidden="true" />}{result.message}</span>}
        <button className="button" type="submit" disabled={pending}><Save size={14} aria-hidden="true" /> {pending ? 'Saving…' : 'Save profile'}</button>
      </div>
    </form>
  );
}
