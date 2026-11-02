'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, Check, Info, MapPin } from 'lucide-react';
import { useRef, useState } from 'react';
import { submitProperty } from './actions';

const emptyForm = {
  code: '',
  accountNumber: '',
  propertyName: '',
  propertyClass: '',
  buildingStatus: '',
  propertyStatus: '',
  propertyUse: '',
  tenureType: '',
  structureType: '',
  polygonGeoJson: '',
};

const steps = ['Property details', 'Boundary', 'Review'];

function isValidPolygon(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('type' in parsed) || parsed.type !== 'Polygon' || !('coordinates' in parsed) || !Array.isArray(parsed.coordinates)) {
      return false;
    }

    const rings: unknown[] = parsed.coordinates;
    return rings.length > 0 && rings.every((ring) => {
      if (!Array.isArray(ring) || ring.length < 4) return false;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!Array.isArray(first) || !Array.isArray(last) || first.length < 2 || last.length < 2) return false;
      if (first[0] !== last[0] || first[1] !== last[1]) return false;
      return ring.every((position) =>
        Array.isArray(position) &&
        position.length >= 2 &&
        typeof position[0] === 'number' &&
        typeof position[1] === 'number' &&
        Number.isFinite(position[0]) &&
        Number.isFinite(position[1]) &&
        position[0] >= -180 &&
        position[0] <= 180 &&
        position[1] >= -90 &&
        position[1] <= 90,
      );
    });
  } catch {
    return false;
  }
}

export default function NewPropertyPage() {
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const boundaryRef = useRef<HTMLTextAreaElement>(null);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setResult(null);
  }

  function nextStep() {
    if (step === 1 && boundaryRef.current) {
      boundaryRef.current.setCustomValidity(
        isValidPolygon(form.polygonGeoJson) ? '' : 'Enter a valid Polygon with closed coordinate rings and positions in longitude, latitude order.',
      );
    }
    if (formRef.current?.reportValidity()) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await submitProperty({
        ...form,
        accountNumber: form.accountNumber || undefined,
        propertyName: form.propertyName || undefined,
        propertyClass: form.propertyClass || undefined,
        buildingStatus: form.buildingStatus || undefined,
        propertyStatus: form.propertyStatus || undefined,
        propertyUse: form.propertyUse || undefined,
        tenureType: form.tenureType || undefined,
        structureType: form.structureType || undefined,
      });
      setResult(
        res.ok
          ? { ok: true, message: 'CROIP accepted the registration. It will appear in the property directory after the next sync.' }
          : { ok: false, message: res.message ?? `CROIP write failed (${res.status ?? 'network error'}).` },
      );
    } catch {
      setResult({ ok: false, message: 'Unable to submit the registration. Check the portal configuration and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="entity-page">
      <div className="entity-breadcrumb">
        <Link href="/properties">Properties</Link><span>/</span><span>New registration</span>
      </div>
      <div className="entity-hero onboarding-hero">
        <div className="entity-hero-copy">
          <span className="entity-kicker"><span className="module-kicker-icon"><Building2 size={14} aria-hidden="true" /></span> PROPERTY ONBOARDING</span>
          <h1>Register a property</h1>
          <p>Create a property record with its classification and mapped boundary.</p>
        </div>
        <Link className="quiet-link" href="/properties"><ArrowLeft size={14} aria-hidden="true" /> Back to directory</Link>
      </div>

      <div className="onboarding-layout">
        <aside className="onboarding-aside">
          <p className="stepper-title">Registration steps</p>
          <ol className="stepper">
            {steps.map((label, index) => (
              <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>
                <span className="stepper-number">{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
                <span className="stepper-label">{label}<small>{['Identifier and classification', 'GeoJSON property outline', 'Confirm your details'][index]}</small></span>
              </li>
            ))}
          </ol>
          <div className="onboarding-note">
            <span className="note-icon"><Info size={13} aria-hidden="true" /></span>
            <p><strong>Mapped property boundary</strong><br />The boundary must be a valid GeoJSON Polygon. Use longitude first, then latitude, for every coordinate pair.</p>
          </div>
        </aside>

        <div className="onboarding-card">
          <form ref={formRef} onSubmit={onSubmit}>
            {step === 0 && (
              <div className="wizard-panel">
                <div className="wizard-heading">
                  <span className="wizard-icon"><Building2 size={18} aria-hidden="true" /></span>
                  <div><h2>Property details</h2><p>Give this property a unique identifier and describe its use.</p></div>
                </div>
                <div className="field-grid">
                  <label className="field">Property code <span className="field-required">Required</span>
                    <input value={form.code} onChange={(event) => update('code', event.target.value)} minLength={3} maxLength={50} placeholder="e.g. PROP-00482" required />
                    <small>Use the unique code recognized by CROIP.</small>
                  </label>
                  <label className="field">Account number <span className="field-optional">Optional</span>
                    <input value={form.accountNumber} onChange={(event) => update('accountNumber', event.target.value)} maxLength={50} placeholder="Billing account number" />
                  </label>
                  <label className="field">Property name <span className="field-optional">Optional</span>
                    <input value={form.propertyName} onChange={(event) => update('propertyName', event.target.value)} maxLength={150} placeholder="Name used locally" />
                  </label>
                  <label className="field">Property class <span className="field-optional">Optional</span>
                    <input value={form.propertyClass} onChange={(event) => update('propertyClass', event.target.value)} placeholder="e.g. Residential" />
                  </label>
                  <label className="field">Property use <span className="field-optional">Optional</span>
                    <input value={form.propertyUse} onChange={(event) => update('propertyUse', event.target.value)} placeholder="e.g. Commercial" />
                  </label>
                  <label className="field">Tenure type <span className="field-optional">Optional</span>
                    <input value={form.tenureType} onChange={(event) => update('tenureType', event.target.value)} placeholder="e.g. Leasehold" />
                  </label>
                  <label className="field">Building status <span className="field-optional">Optional</span>
                    <input value={form.buildingStatus} onChange={(event) => update('buildingStatus', event.target.value)} placeholder="e.g. Completed" />
                  </label>
                  <label className="field">Property status <span className="field-optional">Optional</span>
                    <input value={form.propertyStatus} onChange={(event) => update('propertyStatus', event.target.value)} placeholder="Current status" />
                  </label>
                  <label className="field field-wide">Structure type <span className="field-optional">Optional</span>
                    <input value={form.structureType} onChange={(event) => update('structureType', event.target.value)} placeholder="e.g. Detached house" />
                  </label>
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="wizard-panel">
                <div className="wizard-heading">
                  <span className="wizard-icon"><MapPin size={18} aria-hidden="true" /></span>
                  <div><h2>Property boundary</h2><p>Add the geographic outline that identifies this property on the map.</p></div>
                </div>
                <label className="field">GeoJSON Polygon <span className="field-required">Required</span>
                  <textarea
                    className="geojson-input"
                    ref={boundaryRef}
                    value={form.polygonGeoJson}
                    onChange={(event) => {
                      boundaryRef.current?.setCustomValidity('');
                      update('polygonGeoJson', event.target.value);
                    }}
                    placeholder={'{\n  "type": "Polygon",\n  "coordinates": [[[longitude, latitude], [longitude, latitude], [longitude, latitude], [longitude, latitude]]]\n}'}
                    rows={10}
                    spellCheck={false}
                    aria-describedby="geojson-help"
                    required
                  />
                  <small id="geojson-help">Paste a GeoJSON Polygon. Coordinates use [longitude, latitude] order and the outer ring must close by repeating its first point.</small>
                </label>
                <div className="format-hint"><Check size={15} aria-hidden="true" /><div><strong>Accepted format</strong><code>{'{"type":"Polygon","coordinates":[[[lon,lat],...]]}'}</code></div></div>
              </div>
            )}
            {step === 2 && (
              <div className="wizard-panel">
                <div className="wizard-heading">
                  <span className="wizard-icon"><Check size={18} aria-hidden="true" /></span>
                  <div><h2>Review registration</h2><p>Check the property record and boundary before sending it to CROIP.</p></div>
                </div>
                <div className="review-card">
                  <div className="review-section">
                    <div className="review-section-heading"><strong>Property details</strong><button type="button" className="text-button" onClick={() => setStep(0)}>Edit</button></div>
                    <dl className="review-grid">
                      <div><dt>Property code</dt><dd>{form.code}</dd></div>
                      <div><dt>Account number</dt><dd>{form.accountNumber || 'Not provided'}</dd></div>
                      <div><dt>Property name</dt><dd>{form.propertyName || 'Not provided'}</dd></div>
                      <div><dt>Property class</dt><dd>{form.propertyClass || 'Not provided'}</dd></div>
                      <div><dt>Property use</dt><dd>{form.propertyUse || 'Not provided'}</dd></div>
                      <div><dt>Tenure / structure</dt><dd>{[form.tenureType, form.structureType].filter(Boolean).join(' · ') || 'Not provided'}</dd></div>
                    </dl>
                  </div>
                  <div className="review-section">
                    <div className="review-section-heading"><strong>Mapped boundary</strong><button type="button" className="text-button" onClick={() => setStep(1)}>Edit</button></div>
                    <p className="boundary-summary"><span className="boundary-icon"><MapPin size={16} aria-hidden="true" /></span><span><strong>GeoJSON Polygon provided</strong><small>Boundary data is ready for review.</small></span></p>
                  </div>
                </div>
                <p className="review-disclaimer">By submitting, you’ll send this information to CROIP. The record will be available in the property directory after synchronization.</p>
              </div>
            )}

            <div className="wizard-footer">
              <span className="step-count">Step {step + 1} of {steps.length}<small>{steps[step]}</small></span>
              <div className="wizard-actions">
                {step > 0 && <button type="button" className="button button-secondary" onClick={() => setStep((current) => current - 1)}>Back</button>}
                {step < steps.length - 1 ? (
                  <button type="button" className="button" onClick={(event) => { event.preventDefault(); nextStep(); }}>Continue <ArrowRight size={15} aria-hidden="true" /></button>
                ) : (
                  <button className="button" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Submit registration'}</button>
                )}
              </div>
            </div>
          </form>
          {result && (
            <div className={`notice ${result.ok ? 'ok' : 'error'}`} role={result.ok ? 'status' : 'alert'}>
              {result.message}
              {result.ok && <Link href="/properties" className="notice-link">Open property register <ArrowRight size={13} aria-hidden="true" /></Link>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
