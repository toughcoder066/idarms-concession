'use client';

import { useState } from 'react';
import { Eye, LockKeyhole, X } from 'lucide-react';
import { PREVIEW_PERSONAS } from '@idarms/contracts';
import { startPreviewAction } from '@/app/preview/start-actions';

export function PreviewExperienceButton() {
  const [open, setOpen] = useState(false);
  const [pendingPersona, setPendingPersona] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(persona: string) {
    setPendingPersona(persona);
    setError(null);
    const result = await startPreviewAction(persona);
    if (result) {
      setError(result.message);
      setPendingPersona(null);
    }
  }

  return (
    <>
      <button type="button" className="button button-secondary button-compact" onClick={() => setOpen(true)}>
        <Eye size={14} aria-hidden="true" /> Preview experience
      </button>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !pendingPersona) setOpen(false);
        }}>
          <div className="modal-card preview-picker-modal" role="dialog" aria-modal="true" aria-labelledby="preview-picker-title">
            <div className="modal-heading">
              <div className="directory-title">
                <span className="directory-title-icon"><Eye size={17} aria-hidden="true" /></span>
                <div>
                  <h2 id="preview-picker-title">Preview experience</h2>
                  <p>Choose a generic persona. This is a static simulation, not a real user.</p>
                </div>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} disabled={Boolean(pendingPersona)} aria-label="Close preview picker">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="modal-body">
              <div className="preview-safety-note">
                <LockKeyhole size={14} aria-hidden="true" />
                Preview mode never changes your session, token, or permissions. It uses only fake fixture data and makes no staff or audit reads.
              </div>
              {error && <div className="form-result error" role="alert">{error}</div>}
              <div className="preview-persona-grid">
                {PREVIEW_PERSONAS.map((persona) => (
                  <button
                    key={persona.key}
                    type="button"
                    className="preview-persona-card"
                    onClick={() => choose(persona.key)}
                    disabled={Boolean(pendingPersona)}
                  >
                    <span className="preview-persona-icon"><Eye size={15} aria-hidden="true" /></span>
                    <span>
                      <strong>{persona.label}</strong>
                      <small>{persona.description}</small>
                    </span>
                    {pendingPersona === persona.key ? <em>Opening…</em> : <em>Preview</em>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
