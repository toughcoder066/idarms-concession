'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, Check, Info, MapPin, UserRound, UsersRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { submitRatepayer } from './actions';

const emptyForm = {
  ratepayerType: 'INDIVIDUAL' as 'INDIVIDUAL' | 'ORGANIZATION',
  legalName: '',
  phone: '',
  email: '',
  regionId: '',
  assemblyId: '',
  latitude: '',
  longitude: '',
};

const steps = ['Identity', 'Jurisdiction', 'Review'];

export default function NewRatepayerPage() {
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function update<K extends keyof typeof emptyForm>(field: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setResult(null);
  }

  function nextStep() {
    if (formRef.current?.reportValidity()) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await submitRatepayer({
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        email: form.email || undefined,
      });
      setResult(
        res.ok
          ? { ok: true, message: 'CROIP accepted the registration. It will appear in the directory after the next sync.' }
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
        <Link href="/ratepayers">Ratepayers</Link><span>/</span><span>New registration</span>
      </div>
      <div className="entity-hero onboarding-hero">
        <div className="entity-hero-copy">
          <span className="entity-kicker"><span className="module-kicker-icon"><UsersRound size={14} aria-hidden="true" /></span> RATEPAYER ONBOARDING</span>
          <h1>Register a ratepayer</h1>
          <p>Capture the essential identity and jurisdiction details before sending the record to CROIP.</p>
        </div>
        <Link className="quiet-link" href="/ratepayers"><ArrowLeft size={14} aria-hidden="true" /> Back to directory</Link>
      </div>

      <div className="onboarding-layout">
        <aside className="onboarding-aside">
          <p className="stepper-title">Registration steps</p>
          <ol className="stepper">
            {steps.map((label, index) => (
              <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>
                <span className="stepper-number">{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
                <span className="stepper-label">{label}<small>{['Name and contact', 'Assembly and location', 'Confirm your details'][index]}</small></span>
              </li>
            ))}
          </ol>
          <div className="onboarding-note">
            <span className="note-icon"><Info size={13} aria-hidden="true" /></span>
            <p><strong>System of record</strong><br />Registrations are securely sent to CROIP. A new record appears in your directory after it syncs back to iDARMS.</p>
          </div>
        </aside>

        <div className="onboarding-card">
          <form ref={formRef} onSubmit={onSubmit}>
            {step === 0 && (
              <div className="wizard-panel">
                <div className="wizard-heading">
                  <span className="wizard-icon"><UserRound size={18} aria-hidden="true" /></span>
                  <div><h2>Identity &amp; contact</h2><p>Start with the ratepayer’s identifying details.</p></div>
                </div>
                <div className="field-grid">
                  <label className="field field-wide">Ratepayer category <span className="field-required">Required</span>
                    <div className="choice-grid">
                      <label className={`choice-card${form.ratepayerType === 'INDIVIDUAL' ? ' selected' : ''}`}>
                        <input type="radio" name="ratepayerType" value="INDIVIDUAL" checked={form.ratepayerType === 'INDIVIDUAL'} onChange={() => update('ratepayerType', 'INDIVIDUAL')} />
                        <span className="choice-icon"><UserRound size={16} aria-hidden="true" /></span><span><strong>Individual</strong><small>A person or household</small></span>
                      </label>
                      <label className={`choice-card${form.ratepayerType === 'ORGANIZATION' ? ' selected' : ''}`}>
                        <input type="radio" name="ratepayerType" value="ORGANIZATION" checked={form.ratepayerType === 'ORGANIZATION'} onChange={() => update('ratepayerType', 'ORGANIZATION')} />
                        <span className="choice-icon"><Building2 size={16} aria-hidden="true" /></span><span><strong>Organization</strong><small>A business or institution</small></span>
                      </label>
                    </div>
                  </label>
                  <label className="field field-wide">Legal name <span className="field-required">Required</span>
                    <input value={form.legalName} onChange={(event) => update('legalName', event.target.value)} minLength={2} maxLength={200} autoComplete="name" placeholder={form.ratepayerType === 'INDIVIDUAL' ? 'Enter full legal name' : 'Enter registered organization name'} required />
                    <small>Use the name shown on official registration documents.</small>
                  </label>
                  <label className="field">Phone number <span className="field-required">Required</span>
                    <input type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} minLength={9} maxLength={30} autoComplete="tel" placeholder="+233 20 000 0000" required />
                  </label>
                  <label className="field">Email address <span className="field-optional">Optional</span>
                    <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} maxLength={254} autoComplete="email" placeholder="name@example.com" />
                  </label>
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="wizard-panel">
                <div className="wizard-heading">
                  <span className="wizard-icon"><MapPin size={18} aria-hidden="true" /></span>
                  <div><h2>Jurisdiction &amp; location</h2><p>Provide the CROIP identifiers and coordinates for this registration.</p></div>
                </div>
                <div className="field-grid">
                  <label className="field">CROIP region ID <span className="field-required">Required</span>
                    <input value={form.regionId} onChange={(event) => update('regionId', event.target.value)} placeholder="Region UUID" aria-describedby="region-help" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}" title="Enter a valid CROIP region UUID." required />
                    <small id="region-help">Enter the region ID assigned in CROIP (UUID format).</small>
                  </label>
                  <label className="field">CROIP assembly ID <span className="field-required">Required</span>
                    <input value={form.assemblyId} onChange={(event) => update('assemblyId', event.target.value)} placeholder="Assembly UUID" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}" title="Enter a valid CROIP assembly UUID." required />
                    <small>Enter the district or municipal assembly ID (UUID format).</small>
                  </label>
                  <div className="field field-wide">
                    <span className="field-label">Location coordinates <span className="field-required">Required</span></span>
                    <div className="field-grid coordinate-grid">
                      <label className="field">Latitude
                        <input type="number" value={form.latitude} onChange={(event) => update('latitude', event.target.value)} min={-90} max={90} step="any" placeholder="e.g. 5.6037" required />
                      </label>
                      <label className="field">Longitude
                        <input type="number" value={form.longitude} onChange={(event) => update('longitude', event.target.value)} min={-180} max={180} step="any" placeholder="e.g. -0.1870" required />
                      </label>
                    </div>
                    <small>Coordinates are sent as a map point. Latitude must be between −90 and 90; longitude between −180 and 180.</small>
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="wizard-panel">
                <div className="wizard-heading">
                  <span className="wizard-icon"><Check size={18} aria-hidden="true" /></span>
                  <div><h2>Review registration</h2><p>Confirm these details before sending them to CROIP.</p></div>
                </div>
                <div className="review-card">
                  <div className="review-section">
                    <div className="review-section-heading"><strong>Identity &amp; contact</strong><button type="button" className="text-button" onClick={() => setStep(0)}>Edit</button></div>
                    <dl className="review-grid">
                      <div><dt>Category</dt><dd>{form.ratepayerType === 'INDIVIDUAL' ? 'Individual' : 'Organization'}</dd></div>
                      <div><dt>Legal name</dt><dd>{form.legalName}</dd></div>
                      <div><dt>Phone</dt><dd>{form.phone}</dd></div>
                      <div><dt>Email</dt><dd>{form.email || 'Not provided'}</dd></div>
                    </dl>
                  </div>
                  <div className="review-section">
                    <div className="review-section-heading"><strong>Jurisdiction &amp; location</strong><button type="button" className="text-button" onClick={() => setStep(1)}>Edit</button></div>
                    <dl className="review-grid">
                      <div><dt>Region ID</dt><dd>{form.regionId}</dd></div>
                      <div><dt>Assembly ID</dt><dd>{form.assemblyId}</dd></div>
                      <div><dt>Latitude</dt><dd>{form.latitude}</dd></div>
                      <div><dt>Longitude</dt><dd>{form.longitude}</dd></div>
                    </dl>
                  </div>
                </div>
                <p className="review-disclaimer">By submitting, you’ll send this information to CROIP. The record will be available in the ratepayer directory after synchronization.</p>
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
              {result.ok && <Link href="/ratepayers" className="notice-link">Open ratepayer directory <ArrowRight size={13} aria-hidden="true" /></Link>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
