'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { createContractAction, updateContractAction } from '@/app/concessions/actions';
import type { Contract } from '@/lib/concessions';

function dateInput(value?: string) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function ContractForm({ contract, canManage }: { contract: Contract | null; canManage: boolean }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  if (!canManage) return null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    const formData = new FormData(event.currentTarget);
    const response = contract ? await updateContractAction(formData) : await createContractAction(formData);
    setResult(response);
    setPending(false);
    if (response.ok) router.refresh();
  }

  return (
    <form className="contract-form dashboard-panel" onSubmit={onSubmit}>
      <div className="dashboard-panel-heading">
        <div><span className="dashboard-section-label">{contract ? 'CONTRACT TERMS' : 'SET UP CONTRACT'}</span><h2>{contract ? 'Edit revenue split' : 'Create concession contract'}</h2><p>The state and concessionaire shares must total 100%.</p></div>
      </div>
      <div className="field-grid">
        <label className="field">Concession code<input name="concessionCode" defaultValue={contract?.concessionCode ?? ''} required placeholder="ZONAL-LOT-2" disabled={Boolean(contract)} /></label>
        <label className="field">Concession name<input name="concessionName" defaultValue={contract?.concessionName ?? ''} required placeholder="Concession name" /></label>
        <label className="field">State share (%)<input name="stateRevenueShare" type="number" min={0} max={100} step="0.01" defaultValue={contract?.stateRevenueShare ?? 40} required /></label>
        <label className="field">Concessionaire share (%)<input name="concessionaireShare" type="number" min={0} max={100} step="0.01" defaultValue={contract?.concessionaireShare ?? 60} required /></label>
        <label className="field">Start date<input name="startDate" type="date" defaultValue={dateInput(contract?.startDate)} required /></label>
        <label className="field">End date<input name="endDate" type="date" defaultValue={dateInput(contract?.endDate)} required /></label>
        {contract && <label className="field">Status<select name="isActive" defaultValue={String(contract.isActive)}><option value="true">Active</option><option value="false">Inactive</option></select></label>}
      </div>
      <div className="assembly-profile-footer">
        {result && <span className={`form-result ${result.ok ? 'ok' : 'error'}`}>{result.message}</span>}
        <button className="button" type="submit" disabled={pending}><Save size={14} aria-hidden="true" /> {pending ? 'Saving…' : contract ? 'Save contract' : 'Create contract'}</button>
      </div>
    </form>
  );
}
