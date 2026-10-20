'use client';

import { useState } from 'react';
import { submitProperty } from './actions';

const emptyForm = {
  reference: '',
  ratepayerId: '',
  propertyType: 'RESIDENTIAL',
  gpsCoordinates: '',
  concessionId: '11111111-1111-1111-1111-111111111111',
  assemblyId: '22222222-2222-2222-2222-222222222222',
};

export default function NewPropertyPage() {
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

    const res = await submitProperty({
      reference: form.reference,
      ratepayerId: form.ratepayerId,
      propertyType: form.propertyType,
      gpsCoordinates: form.gpsCoordinates || undefined,
      concessionId: form.concessionId,
      assemblyId: form.assemblyId,
    });

    setSubmitting(false);
    setResult(
      res.ok
        ? { ok: true, message: 'Property registered in CROIP. The sync bridge will replicate it down.' }
        : { ok: false, message: `CROIP write failed (${res.status ?? 'network error'}).` },
    );
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Property operations</p>
          <h1>Register property</h1>
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
            Ratepayer ID
            <input value={form.ratepayerId} onChange={(e) => update('ratepayerId', e.target.value)} required />
          </label>
          <label>
            Property type
            <select value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)}>
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="INDUSTRIAL">Industrial</option>
              <option value="AGRICULTURAL">Agricultural</option>
            </select>
          </label>
          <label>
            GPS coordinates
            <input value={form.gpsCoordinates} onChange={(e) => update('gpsCoordinates', e.target.value)} />
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
