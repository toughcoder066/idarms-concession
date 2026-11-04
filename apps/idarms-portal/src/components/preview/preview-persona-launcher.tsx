'use client';

import { useState } from 'react';
import { Eye, LockKeyhole } from 'lucide-react';
import { PREVIEW_PERSONAS } from '@idarms/contracts';
import { startPreviewAction } from '@/app/(portal)/preview/start-actions';

export function PreviewPersonaLauncher() {
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
    <div className="preview-launcher">
      <div className="preview-safety-note">
        <LockKeyhole size={14} aria-hidden="true" />
        Preview mode is a read-only frontend simulation. It does not impersonate a real user, request a token, call ZITADEL, or change your session.
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
  );
}
