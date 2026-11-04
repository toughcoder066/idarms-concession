'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Target } from 'lucide-react';
import { saveTargetAction } from '@/app/(portal)/concessions/actions';

export function TargetForm({
  assemblyId,
  fiscalYear,
  currentTarget,
  canManage,
}: {
  assemblyId: string;
  fiscalYear: number;
  currentTarget: number | null;
  canManage: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [value, setValue] = useState(currentTarget === null ? '' : String(currentTarget));
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    const response = await saveTargetAction({
      assemblyId,
      fiscalYear,
      targetAmount: Number(value),
    });
    setResult(response);
    setPending(false);
    if (response.ok) router.refresh();
  }

  return (
    <form className="target-form" onSubmit={onSubmit}>
      <div className="target-form-heading"><span className="directory-metric-icon teal"><Target size={18} aria-hidden="true" /></span><div><span className="dashboard-section-label">FY {fiscalYear} TARGET</span><h2>{currentTarget === null ? 'Set a revenue target' : 'Update revenue target'}</h2><p>Targets drive collection performance conversations, not billing calculations.</p></div></div>
      <label className="field">Annual target (GHS)<input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={!canManage} required placeholder="0.00" /></label>
      <div className="target-form-footer">
        {result && <span className={`form-result ${result.ok ? 'ok' : 'error'}`}>{result.message}</span>}
        <button className="button" type="submit" disabled={!canManage || pending}><Save size={14} aria-hidden="true" /> {pending ? 'Saving…' : 'Save target'}</button>
      </div>
    </form>
  );
}
