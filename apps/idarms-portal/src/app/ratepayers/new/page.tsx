'use client';

import { useState } from 'react';
import { submitRatepayer } from './actions';

const emptyForm = {
  reference: '',
  fullName: '',
  ghanaCardId: '',
  phone: '',
  email: '',
  concessionId: '11111111-1111-1111-1111-111111111111',
  assemblyId: '22222222-2222-2222-2222-222222222222',
};

export default function NewRatepayerPage() {
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    const res = await submitRatepayer({
      reference: form.reference,
      fullName: form.fullName,
      ghanaCardId: form.ghanaCardId || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      concessionId: form.concessionId,
      assemblyId: form.assemblyId,
    });

    setSubmitting(false);
    setResult(
      res.ok
        ? { ok: true, message: 'Ratepayer registered in CROIP. The sync bridge will replicate it down.' }
        : { ok: false, message: `CROIP write failed (${res.status ?? 'network error'}).` },
    );
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">People &amp; accounts</p>
          <h1>Register ratepayer</h1>
          <p className="muted">Create a master record in CROIP. It will appear here after synchronization.</p>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 680, marginTop: 0 }}>
        <p className="muted">This record is submitted directly to the CROIP system of record.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Reference
            <input value={form.reference} onChange={(e) => update('reference', e.target.value)} required />
          </label>
          <label>
            Full name
            <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
          </label>
          <label>
            Ghana card ID
            <input value={form.ghanaCardId} onChange={(e) => update('ghanaCardId', e.target.value)} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </label>
          <label>
            Concession ID
            <input value={form.concessionId} onChange={(e) => update('concessionId', e.target.value)} />
          </label>
          <label>
            Assembly ID
            <input value={form.assemblyId} onChange={(e) => update('assemblyId', e.target.value)} />
          </label>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Register in CROIP'}
          </button>
        </form>
      </div>
      {result && <div className={`notice ${result.ok ? 'ok' : 'error'}`}>{result.message}</div>}
    </section>
  );
}
