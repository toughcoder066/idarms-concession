'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, X } from 'lucide-react';
import { createAssemblyAction } from '@/app/concessions/actions';

export function AssemblyOnboardingForm({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  if (!canManage) return null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setResult(null);
    const response = await createAssemblyAction(new FormData(form));
    setResult(response);
    setPending(false);
    if (response.ok) {
      form.reset();
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="assembly-onboard">
      <button type="button" className="button" onClick={() => setOpen((value) => !value)}>
        {open ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
        {open ? 'Close form' : 'Onboard assembly'}
      </button>
      {open && (
        <form className="assembly-onboard-form" onSubmit={onSubmit}>
          <div className="assembly-onboard-heading"><span className="directory-title-icon"><Building2 size={17} aria-hidden="true" /></span><div><h2>New assembly</h2><p>Create the assembly record; readiness checks start immediately.</p></div></div>
          <div className="field-grid">
            <label className="field">Assembly code <span className="field-required">Required</span><input name="assemblyCode" required minLength={2} maxLength={30} placeholder="e.g. AMA" /></label>
            <label className="field">Assembly name <span className="field-required">Required</span><input name="assemblyName" required minLength={2} maxLength={150} placeholder="e.g. Accra Metropolitan Assembly" /></label>
            <label className="field">Region <span className="field-required">Required</span><input name="region" required placeholder="e.g. Greater Accra" /></label>
            <label className="field">CROIP assembly ID <span className="field-optional">Optional</span><input name="croipAssemblyId" placeholder="croip_asm_..." /></label>
            <label className="field">Administrator email <span className="field-optional">Optional</span><input name="adminEmail" type="email" placeholder="assembly.admin@example.gov.gh" /></label>
            <label className="field">Prefix rules <span className="field-optional">Optional</span><input name="prefixRules" placeholder="GA-, AMA-" /><small>Comma-separated prefixes used to identify assembly records.</small></label>
          </div>
          <div className="assembly-onboard-footer">
            {result && <span className={`form-result ${result.ok ? 'ok' : 'error'}`}>{result.message}</span>}
            <button className="button" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create assembly'}</button>
          </div>
        </form>
      )}
      {!open && result && <span className={`form-result ${result.ok ? 'ok' : 'error'}`}>{result.message}</span>}
    </div>
  );
}
